import { readFileSync, readdirSync } from "node:fs";
import {
  Account,
  Asset,
  Keypair,
  Memo,
  Networks,
  NotFoundError,
  Operation,
  TransactionBuilder,
  TransactionFailedError,
} from "@stellar/stellar-sdk";
import {
  TESTNET_HORIZON,
  TESTNET_PASSPHRASE,
  assertHorizonTicketPayment,
  buildTestnetPayment,
  createPaymentReference,
  createStellarTicketRequestHandler,
  createTestnetServer,
  eurToStroops,
  formatStroops,
  inspectSignedTicketPayment,
  settleTestnetTransaction,
} from "../lib/stellar-ticket-payment.mjs";

const assert = {
  equal(actual, expected, label) {
    if (actual !== expected) {
      throw new Error(`${label}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
    }
  },
  ok(value, label) {
    if (!value) throw new Error(label || "expected a truthy value");
  },
};

const MERCHANT = "GDFQRPV5QGXEY2WAGA3LXMCNNCI2RNIEY4HAHDY7LAXLTABLR32DLX3N";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function createMemoryStore() {
  const events = new Map();
  const tickets = [];
  const payments = [];
  let ticketSeq = 1;

  return {
    events,
    tickets,
    payments,
    async getUser(token) {
      if (token === "user-token") return { id: USER };
      if (token === "other-token") return { id: OTHER };
      return null;
    },
    async getEvent(id) {
      return events.get(id) || null;
    },
    async countPaidTickets(eventId) {
      return tickets
        .filter((row) => row.event_id === eventId && row.payment_status === "paid" && row.ticket_status === "valid")
        .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    },
    async findOpenPayment(userId, eventId) {
      const row = payments.find(
        (item) =>
          item.user_id === userId &&
          item.event_id === eventId &&
          ["pending", "prepared", "submitted"].includes(item.status)
      );
      return row ? { ...row } : null;
    },
    async insertTicket(row) {
      const saved = { ...row, id: ticketSeq++ };
      tickets.push(saved);
      return { id: saved.id };
    },
    async deletePendingTicket(id, userId) {
      const index = tickets.findIndex(
        (row) => row.id === id && row.user_id === userId && row.payment_status === "pending"
      );
      if (index >= 0) tickets.splice(index, 1);
    },
    async insertPayment(row) {
      if (payments.some((item) => item.payment_reference === row.payment_reference)) {
        throw new Error("duplicate reference");
      }
      if (
        payments.some(
          (item) =>
            item.user_id === row.user_id &&
            item.event_id === row.event_id &&
            ["pending", "prepared", "submitted"].includes(item.status)
        )
      ) {
        const error = new Error(
          'duplicate key value violates unique constraint "stellar_ticket_payments_one_open_event"'
        );
        error.code = "23505";
        throw error;
      }
      const saved = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
      payments.push(saved);
      return { ...saved };
    },
    async getPaymentForUser(id, userId) {
      const row = payments.find((item) => item.id === id && item.user_id === userId);
      return row ? { ...row } : null;
    },
    async getTicketForUser(id, userId) {
      const row = tickets.find((item) => item.id === id && item.user_id === userId);
      return row ? { ...row } : null;
    },
    async findByHash(hash) {
      const row = payments.find((item) => item.tx_hash === hash);
      return row ? { ...row } : null;
    },
    async updatePaymentIf(id, userId, statuses, patch) {
      const row = payments.find(
        (item) => item.id === id && item.user_id === userId && statuses.includes(item.status)
      );
      if (!row) return null;
      Object.assign(row, patch, { updated_at: new Date().toISOString() });
      return { ...row };
    },
    async markExpired(id, userId) {
      const row = payments.find((item) => item.id === id && item.user_id === userId);
      if (!row || row.tx_hash || row.confirmed_at || row.status === "confirmed") return null;
      if (!["pending", "prepared", "submitted", "failed"].includes(row.status)) return null;
      row.status = "expired";
      return { id: row.id };
    },
    async updateTicketIfPending(id, userId, patch) {
      const row = tickets.find(
        (item) =>
          item.id === id &&
          item.user_id === userId &&
          item.payment_status === "pending" &&
          item.ticket_status === "pending"
      );
      if (!row) return null;
      Object.assign(row, patch);
      return { ...row };
    },
  };
}

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function fundedAccount(publicKey, balance = "1000.0000000") {
  const account = new Account(publicKey, "1000");
  account.balances = [
    { asset_type: "native", balance, selling_liabilities: "0" },
  ];
  account.subentry_count = 0;
  account.num_sponsoring = 0;
  account.num_sponsored = 0;
  return account;
}

function fakeTestnetServer(options = {}) {
  const submits = { count: 0 };
  const server = {
    serverURL: new URL(TESTNET_HORIZON),
    submits,
    async loadAccount(id) {
      if (options.missing?.has(id)) {
        throw new NotFoundError("missing", { status: 404 });
      }
      return fundedAccount(id, options.balance || "1000.0000000");
    },
    ledgers() {
      return {
        order() {
          return {
            limit() {
              return {
                call: async () => ({
                  records: [
                    {
                      base_reserve_in_stroops: "5000000",
                      base_fee_in_stroops: "100",
                    },
                  ],
                }),
              };
            },
          };
        },
      };
    },
    transactions() {
      return {
        transaction() {
          return {
            call: async () => {
              throw new NotFoundError("missing", { status: 404 });
            },
          };
        },
      };
    },
    async submitTransaction(transaction) {
      submits.count += 1;
      if (options.submit) return options.submit(transaction, submits);
      throw new Error("network down");
    },
    operations() {
      return {
        forTransaction(hash) {
          return {
            call: async () => ({
              records: options.operations ? options.operations(hash) : [],
            }),
          };
        },
      };
    },
  };
  return server;
}

function quoteFetch(rate = 0.25) {
  return async () => ({
    ok: true,
    async json() {
      return { stellar: { eur: rate } };
    },
  });
}

async function callHandler(action, { store, server, token, body, env }) {
  const handler = createStellarTicketRequestHandler(action, {
    env: {
      SUPABASE_URL: "http://127.0.0.1",
      SUPABASE_SERVICE_ROLE_KEY: "test-only",
      HAVKAR_STELLAR_TICKET_MERCHANT_PUBLIC_KEY: MERCHANT,
      ...env,
    },
    store,
    server,
    fetchImpl: quoteFetch(),
  });
  const res = mockRes();
  await handler(
    {
      method: action === "status" ? "GET" : "POST",
      headers: { authorization: token ? `Bearer ${token}` : "" },
      body,
      query: body,
    },
    res
  );
  return res;
}

function hexHash(transaction) {
  return Buffer.from(transaction.hash()).toString("hex");
}

function localExpected(transaction, source, destination, memo) {
  return {
    source,
    destination,
    amountText: "1.0000000",
    memo,
    hash: hexHash(transaction),
    sequence: String(transaction.sequence),
    fee: String(transaction.fee),
    minTime: String(transaction.timeBounds.minTime),
    maxTime: String(transaction.timeBounds.maxTime),
  };
}

function buildLocal(passphrase, source, destination, memo, timebounds) {
  let builder = new TransactionBuilder(new Account(source.publicKey(), "50"), {
    fee: "100",
    networkPassphrase: passphrase,
  })
    .addOperation(
      Operation.payment({
        destination: destination.publicKey(),
        asset: Asset.native(),
        amount: "1.0000000",
      })
    )
    .addMemo(Memo.text(memo));

  if (timebounds) builder = builder.setTimebounds(timebounds.min, timebounds.max);
  else builder = builder.setTimeout(180);

  return builder.build();
}

async function localChecks() {
  assert.equal(formatStroops(eurToStroops(10, 0.25)), "40.0000000", "exact quote");
  assert.equal(formatStroops(eurToStroops(10, 3)), "3.3333334", "rounded up");
  assert.equal(TESTNET_PASSPHRASE, "Test SDF Network ; September 2015", "testnet passphrase");
  assert.equal(Networks.PUBLIC, "Public Global Stellar Network ; September 2015", "mainnet passphrase untouched");

  const source = Keypair.random();
  const destination = Keypair.random();
  const memo = createPaymentReference();
  const transaction = buildLocal(Networks.TESTNET, source, destination, memo);
  transaction.sign(source);
  const expected = localExpected(transaction, source.publicKey(), destination.publicKey(), memo);
  const inspected = inspectSignedTicketPayment({
    signedXdr: transaction.toXDR(),
    expected,
  });
  assert.equal(inspected.hash, expected.hash, "matching signature");

  const wrongKey = Keypair.random();
  const rejected = buildLocal(Networks.TESTNET, source, destination, memo);
  rejected.sign(wrongKey);
  let rejectedThrown = false;
  try {
    inspectSignedTicketPayment({
      signedXdr: rejected.toXDR(),
      expected: localExpected(rejected, source.publicKey(), destination.publicKey(), memo),
    });
  } catch (error) {
    rejectedThrown = error.message === "mismatch";
  }
  assert.ok(rejectedThrown, "rejected signature");

  let wrongDestination = false;
  try {
    inspectSignedTicketPayment({
      signedXdr: transaction.toXDR(),
      expected: { ...expected, destination: Keypair.random().publicKey() },
    });
  } catch (error) {
    wrongDestination = error.message === "mismatch";
  }
  assert.ok(wrongDestination, "invalid destination");

  let wrongAmount = false;
  try {
    inspectSignedTicketPayment({
      signedXdr: transaction.toXDR(),
      expected: { ...expected, amountText: "2.0000000" },
    });
  } catch (error) {
    wrongAmount = error.message === "mismatch";
  }
  assert.ok(wrongAmount, "invalid amount");

  const publicTransaction = buildLocal(Networks.PUBLIC, source, destination, memo);
  publicTransaction.sign(source);
  let wrongNetwork = false;
  try {
    inspectSignedTicketPayment({
      signedXdr: publicTransaction.toXDR(),
      expected: localExpected(publicTransaction, source.publicKey(), destination.publicKey(), memo),
    });
  } catch (error) {
    wrongNetwork = error.message === "mismatch";
  }
  assert.ok(wrongNetwork, "network mismatch");

  const expired = buildLocal(Networks.TESTNET, source, destination, memo, {
    min: 0,
    max: Math.floor(Date.now() / 1000) - 30,
  });
  expired.sign(source);
  let expiredThrown = false;
  try {
    inspectSignedTicketPayment({
      signedXdr: expired.toXDR(),
      expected: localExpected(expired, source.publicKey(), destination.publicKey(), memo),
    });
  } catch (error) {
    expiredThrown = error.message === "expired";
  }
  assert.ok(expiredThrown, "expired transaction");

  let submits = 0;
  try {
    await settleTestnetTransaction({
      server: {
        serverURL: new URL("https://horizon.stellar.org"),
        async submitTransaction() {
          submits += 1;
        },
      },
      signedXdr: transaction.toXDR(),
      expected,
    });
    throw new Error("public horizon was accepted");
  } catch (error) {
    assert.ok(
      String(error.message).includes("Testnet"),
      "public horizon rejected"
    );
  }
  assert.equal(submits, 0, "public horizon was not used");
}

async function handlerChecks() {
  const store = createMemoryStore();
  store.events.set(7, {
    id: 7,
    price: "10.00",
    is_public: true,
    status: "active",
    max_attendees: null,
  });
  const server = fakeTestnetServer();

  const unauthenticated = await callHandler("intent", {
    store,
    server,
    body: { event_id: 7, quantity: 1 },
  });
  assert.equal(unauthenticated.statusCode, 401, "auth required");

  const missingMerchant = await callHandler("intent", {
    store,
    server,
    token: "user-token",
    body: { event_id: 7, quantity: 1, amount_xlm: "0.0000001", destination: sourceAddress() },
    env: { HAVKAR_STELLAR_TICKET_MERCHANT_PUBLIC_KEY: "" },
  });
  assert.equal(missingMerchant.statusCode, 503, "merchant required");
  assert.equal(store.tickets.length, 0, "no ticket without merchant");

  const created = await callHandler("intent", {
    store,
    server,
    token: "user-token",
    body: {
      event_id: 7,
      quantity: 1,
      amount_xlm: "0.0000001",
      destination: Keypair.random().publicKey(),
      eur_per_xlm: 999999,
      status: "confirmed",
    },
  });
  assert.equal(created.statusCode, 200, "intent created");
  assert.equal(created.body.amount_xlm, "40.0000000", "server amount");
  assert.equal(created.body.destination, MERCHANT, "server destination");
  assert.equal(created.body.network, "TESTNET", "testnet only");
  assert.equal(created.body.status, "pending", "not self-confirmed");
  assert.equal(store.tickets[0].payment_status, "pending", "ticket stays pending");
  assert.equal(store.tickets[0].payment_provider, "stellar", "stellar provider");

  const stranger = await callHandler("prepare", {
    store,
    server,
    token: "other-token",
    body: {
      payment_id: created.body.payment_id,
      source_public_key: Keypair.random().publicKey(),
    },
  });
  assert.equal(stranger.statusCode, 404, "other user cannot prepare");

  const poor = fakeTestnetServer({ balance: "1.0000000" });
  const insufficient = await callHandler("prepare", {
    store,
    server: poor,
    token: "user-token",
    body: {
      payment_id: created.body.payment_id,
      source_public_key: Keypair.random().publicKey(),
    },
  });
  assert.equal(insufficient.statusCode, 409, "insufficient balance");
  assert.equal(store.tickets[0].payment_status, "pending", "insufficient does not confirm");

  const source = Keypair.random();
  const prepared = await callHandler("prepare", {
    store,
    server,
    token: "user-token",
    body: { payment_id: created.body.payment_id, source_public_key: source.publicKey() },
  });
  assert.equal(prepared.statusCode, 200, "prepared");
  assert.equal(
    prepared.body.network_passphrase,
    "Test SDF Network ; September 2015",
    "prepare passphrase"
  );

  const signed = TransactionBuilder.fromXDR(prepared.body.xdr, Networks.TESTNET);
  signed.sign(source);
  const networkServer = fakeTestnetServer();
  const networkFailure = await callHandler("submit", {
    store,
    server: networkServer,
    token: "user-token",
    body: {
      payment_id: created.body.payment_id,
      signed_xdr: signed.toXDR(),
      status: "confirmed",
    },
  });
  assert.equal(networkFailure.statusCode, 502, "network failure");
  assert.equal(networkServer.submits.count, 1, "network attempt");
  assert.equal(store.tickets[0].payment_status, "pending", "network failure does not confirm");
  assert.equal(
    store.payments[0].status,
    "submitted",
    "network failure stays unconfirmed"
  );

  const rejectedServer = fakeTestnetServer({
    submit() {
      throw new TransactionFailedError("rejected", { status: 400 });
    },
  });
  const rejected = await callHandler("submit", {
    store,
    server: rejectedServer,
    token: "user-token",
    body: { payment_id: created.body.payment_id, signed_xdr: signed.toXDR() },
  });
  assert.equal(rejected.statusCode, 409, "rejected transaction");
  assert.equal(store.payments[0].status, "failed", "rejected stays failed");
  assert.equal(store.tickets[0].ticket_status, "pending", "rejected ticket");

  const successServer = fakeTestnetServer({
    submit(transaction) {
      return {
        successful: true,
        source_account: source.publicKey(),
        hash: hexHash(transaction),
        memo_type: "text",
        memo: created.body.payment_reference,
        operation_count: 1,
        ledger: 42,
      };
    },
    operations() {
      return [
        {
          type: "payment",
          asset_type: "native",
          from: source.publicKey(),
          to: MERCHANT,
          amount: "40.0000000",
        },
      ];
    },
  });
  const success = await callHandler("submit", {
    store,
    server: successServer,
    token: "user-token",
    body: { payment_id: created.body.payment_id, signed_xdr: signed.toXDR() },
  });
  assert.equal(success.statusCode, 200, "simulated horizon match");
  assert.equal(success.body.confirmed, true, "ticket confirmed");
  assert.equal(store.tickets[0].payment_status, "paid", "ticket paid");
  assert.equal(store.tickets[0].ticket_status, "valid", "ticket valid");
  assert.equal(store.tickets[0].payment_reference, success.body.tx_hash, "receipt hash");

  const replay = await callHandler("submit", {
    store,
    server: successServer,
    token: "user-token",
    body: { payment_id: created.body.payment_id, signed_xdr: signed.toXDR() },
  });
  assert.equal(replay.statusCode, 200, "same payment replay");
  assert.equal(replay.body.tx_hash, success.body.tx_hash, "same hash");
  assert.equal(successServer.submits.count, 1, "replay did not submit again");

  store.events.set(8, {
    id: 8,
    price: "1.00",
    is_public: true,
    status: "active",
    max_attendees: null,
  });
  const second = await callHandler("intent", {
    store,
    server,
    token: "user-token",
    body: { event_id: 8, quantity: 1 },
  });
  const secondSource = Keypair.random();
  const secondPrepared = await callHandler("prepare", {
    store,
    server,
    token: "user-token",
    body: {
      payment_id: second.body.payment_id,
      source_public_key: secondSource.publicKey(),
    },
  });
  const secondSigned = TransactionBuilder.fromXDR(secondPrepared.body.xdr, Networks.TESTNET);
  secondSigned.sign(secondSource);
  store.payments.find((row) => row.id === created.body.payment_id).tx_hash =
    secondPrepared.body.prepared_hash;
  const duplicate = await callHandler("submit", {
    store,
    server: successServer,
    token: "user-token",
    body: { payment_id: second.body.payment_id, signed_xdr: secondSigned.toXDR() },
  });
  assert.equal(duplicate.statusCode, 409, "duplicate hash rejected");
  assert.equal(
    store.tickets.find((row) => row.event_id === 8).payment_status,
    "pending",
    "duplicate does not confirm"
  );
}

function sourceAddress() {
  return Keypair.random().publicKey();
}

function repositoryChecks() {
  const source = readFileSync(new URL("../stellar-wallet-source.js", import.meta.url), "utf8");
  const events = readFileSync(new URL("../events.html", import.meta.url), "utf8");
  const migration = readFileSync(
    new URL("../supabase/migrations/20261020095735_stellar_ticket_payments.sql", import.meta.url),
    "utf8"
  );
  const delivery = readFileSync(new URL("../delivery.html", import.meta.url), "utf8");
  const market = readFileSync(new URL("../market.html", import.meta.url), "utf8");
  const start = source.indexOf("async function havkarSignPreparedStellarXdr");
  const end = source.indexOf("EXPOSE HAVKAR FUNCTIONS", start);
  const signer = source.slice(start, end);

  assert.ok(/STELLAR_MAINNET_PAYMENTS_ENABLED\s*=\s*true/.test(source), "mainnet flag stays on");
  assert.equal(signer.includes("submitTransaction"), false, "service signer does not submit");
  assert.ok(signer.includes("Networks.TESTNET"), "service signer is testnet");
  assert.ok(source.includes("async function havkarSignAndSubmitStellarPayment"), "wallet submit remains");
  assert.ok(events.includes("/api/create-event-checkout"), "card checkout remains");
  assert.ok(events.includes("/api/stellar-ticket-intent"), "intent url remains");
  assert.ok(events.includes("/api/stellar-ticket-prepare"), "prepare url remains");
  assert.ok(events.includes("/api/stellar-ticket-submit"), "submit url remains");
  assert.ok(events.includes("payTicketWithXlm"), "xlm checkout added");
  const apiNames = readdirSync(new URL("../api/", import.meta.url)).filter((name) => name.endsWith(".js"));
  assert.equal(apiNames.length, 12, "twelve functions");
  assert.equal(apiNames.includes("stellar-ticket.js"), true, "one stellar function");
  assert.equal(apiNames.includes("stellar-ticket-intent.js"), false, "intent file merged");
  assert.equal(apiNames.includes("stellar-ticket-prepare.js"), false, "prepare file merged");
  assert.equal(apiNames.includes("stellar-ticket-submit.js"), false, "submit file merged");
  assert.equal(apiNames.includes("stellar-ticket-status.js"), false, "status file merged");
  assert.equal(apiNames.includes("flight-offer.js"), false, "offer file merged");
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(
    vercel.rewrites.some((rule) => rule.source === "/api/stellar-ticket-submit" && rule.destination === "/api/stellar-ticket?stellarAction=submit"),
    true,
    "submit rewrite"
  );
  assert.equal(events.includes("havkarSignAndSubmitStellarPayment"), false, "events do not use wallet submit");
  assert.equal(delivery.includes("havkarSignAndSubmitStellarPayment"), false, "delivery unchanged");
  assert.equal(market.includes("havkarSignAndSubmitStellarPayment"), false, "market unchanged");
  assert.ok(migration.includes("ENABLE ROW LEVEL SECURITY"), "rls enabled");
  assert.ok(migration.includes("FOR SELECT"), "select policy");
  assert.equal(migration.includes("FOR INSERT"), false, "no insert policy");
  assert.equal(migration.includes("FOR UPDATE"), false, "no update policy");
  assert.equal(migration.includes("FOR DELETE"), false, "no delete policy");
  assert.ok(migration.includes("network = 'TESTNET'"), "table is testnet");
  assert.equal(migration.includes("ON DELETE CASCADE"), false, "payment history is not cascaded");
  assert.equal(
    (migration.match(/REFERENCES .+ ON DELETE RESTRICT/g) || []).length,
    3,
    "three restrict keys"
  );
  assert.equal(
    migration.includes("GRANT SELECT, INSERT, UPDATE, DELETE"),
    false,
    "service role is not granted delete"
  );
  assert.ok(readFileSync(new URL("../havkar-i18n.js", import.meta.url), "utf8").includes('code: "ckb"'), "sorani remains");
  assert.ok(readFileSync(new URL("../havkar-i18n.js", import.meta.url), "utf8").includes('code: "kmr"'), "kurmanji remains");

  let horizonMismatch = false;
  try {
    assertHorizonTicketPayment(
      {
        successful: true,
        source_account: "G",
        hash: "a".repeat(64),
        memo_type: "text",
        memo: "hk",
        operation_count: 1,
      },
      [{ type: "payment", asset_type: "native", from: "G", to: "H", amount: "1.0000000" }],
      {
        source: "G",
        destination: "H",
        amountText: "2.0000000",
        memo: "hk",
        hash: "a".repeat(64),
      }
    );
  } catch (error) {
    horizonMismatch = error.definitive === true;
  }
  assert.ok(horizonMismatch, "horizon amount mismatch is rejected");
}

async function liveTestnet() {
  const source = Keypair.random();
  const friend = await fetch(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(source.publicKey())}`
  );
  assert.equal(friend.status, 200, "friendbot");

  const server = createTestnetServer();
  let account = null;
  for (let attempt = 0; attempt < 8 && !account; attempt += 1) {
    try {
      account = await server.loadAccount(source.publicKey());
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  assert.ok(account, "funded testnet account");

  const memo = createPaymentReference();
  const built = await buildTestnetPayment({
    server,
    source: source.publicKey(),
    destination: MERCHANT,
    stroops: 1000000n,
    memo,
  });
  const transaction = TransactionBuilder.fromXDR(built.xdr, Networks.TESTNET);
  transaction.sign(source);
  const expected = {
    source: source.publicKey(),
    destination: MERCHANT,
    amountText: built.amountText,
    memo,
    hash: built.hash,
    sequence: built.sequence,
    fee: built.fee,
    minTime: built.minTime,
    maxTime: built.maxTime,
  };

  let submits = 0;
  const original = server.submitTransaction.bind(server);
  server.submitTransaction = async (value) => {
    submits += 1;
    return original(value);
  };

  const settled = await settleTestnetTransaction({
    server,
    signedXdr: transaction.toXDR(),
    expected,
  });
  assert.equal(settled.hash, built.hash, "live hash");
  assert.equal(submits, 1, "one live submit");

  const seen = await fetch(`${TESTNET_HORIZON}/transactions/${settled.hash}`);
  assert.equal(seen.status, 200, "live horizon read");
  const body = await seen.json();
  assert.equal(body.successful, true, "live success");
  assert.equal(body.source_account, source.publicKey(), "live source");
  assert.equal(body.memo, memo, "live memo");
  const operations = await fetch(`${TESTNET_HORIZON}/transactions/${settled.hash}/operations`);
  const operationBody = await operations.json();
  assert.equal(operationBody._embedded.records.length, 1, "one live operation");
  assert.equal(operationBody._embedded.records[0].to, MERCHANT, "live destination");
  assert.equal(operationBody._embedded.records[0].amount, "0.1000000", "live amount");

  const replay = await settleTestnetTransaction({
    server,
    signedXdr: transaction.toXDR(),
    expected,
  });
  assert.equal(replay.hash, settled.hash, "live replay");
  assert.equal(submits, 1, "live replay did not submit");

  let insufficient = false;
  try {
    await buildTestnetPayment({
      server,
      source: source.publicKey(),
      destination: MERCHANT,
      stroops: 900000000000000n,
      memo: createPaymentReference(),
    });
  } catch (error) {
    insufficient = error.code === "insufficient";
  }
  assert.ok(insufficient, "live insufficient balance");
  assert.equal(submits, 1, "insufficient balance did not submit");

  let missingDestination = false;
  try {
    await buildTestnetPayment({
      server,
      source: source.publicKey(),
      destination: Keypair.random().publicKey(),
      stroops: 1000000n,
      memo: createPaymentReference(),
    });
  } catch (error) {
    missingDestination = error.code === "missing-destination";
  }
  assert.ok(missingDestination, "live invalid destination");
  assert.equal(submits, 1, "invalid destination did not submit");

  console.log(`TESTNET_TICKET_HASH ${settled.hash}`);
}

async function expiredCheckoutChecks() {
  const store = createMemoryStore();
  store.events.set(9, {
    id: 9,
    price: "10.00",
    is_public: true,
    status: "active",
    max_attendees: null,
  });
  const server = fakeTestnetServer();
  store.tickets.push({
    id: 90,
    user_id: USER,
    event_id: 9,
    quantity: 1,
    payment_status: "pending",
    ticket_status: "pending",
  });
  store.payments.push({
    id: "expired-payment",
    user_id: USER,
    event_id: 9,
    event_ticket_id: 90,
    status: "pending",
    tx_hash: null,
    confirmed_at: null,
    expires_at: "2020-01-01T00:00:00.000Z",
    payment_reference: "OLDREF1",
    amount_stroops: 400000000,
    destination_public_key: MERCHANT,
    network_passphrase: "Test SDF Network ; September 2015",
  });

  const replaced = await callHandler("intent", {
    store,
    server,
    token: "user-token",
    body: { event_id: 9, quantity: 1 },
  });
  assert.equal(replaced.statusCode, 200, "expired payment allows a new intent");
  assert.equal(replaced.body.resumed, false, "expired payment is not resumed");
  assert.ok(replaced.body.payment_id !== "expired-payment", "fresh payment id");
  assert.equal(store.payments[0].status, "expired", "old payment is expired");
  assert.equal(store.tickets[0].payment_status, "pending", "old ticket stays unpaid");
  assert.equal(
    store.payments.filter((row) => ["pending", "prepared", "submitted"].includes(row.status)).length,
    1,
    "one open payment after expiry"
  );

  const resumed = await callHandler("intent", {
    store,
    server,
    token: "user-token",
    body: { event_id: 9, quantity: 1 },
  });
  assert.equal(resumed.statusCode, 200, "valid payment resumes");
  assert.equal(resumed.body.resumed, true, "resume flag");
  assert.equal(resumed.body.payment_id, replaced.body.payment_id, "same valid payment");
  assert.equal(store.payments.length, 2, "resume does not create another payment");

  const protectedStore = createMemoryStore();
  protectedStore.events.set(9, store.events.get(9));
  protectedStore.tickets.push({
    id: 91,
    user_id: USER,
    event_id: 9,
    quantity: 1,
    payment_status: "pending",
    ticket_status: "pending",
  });
  protectedStore.payments.push({
    id: "submitted-payment",
    user_id: USER,
    event_id: 9,
    event_ticket_id: 91,
    status: "submitted",
    tx_hash: "a".repeat(64),
    confirmed_at: null,
    expires_at: "2020-01-01T00:00:00.000Z",
    payment_reference: "OLDREF2",
    amount_stroops: 400000000,
    destination_public_key: MERCHANT,
    network_passphrase: "Test SDF Network ; September 2015",
  });
  const protectedPayment = await callHandler("intent", {
    store: protectedStore,
    server,
    token: "user-token",
    body: { event_id: 9, quantity: 1 },
  });
  assert.equal(protectedPayment.statusCode, 409, "submitted transaction is not replaced");
  assert.equal(protectedStore.payments[0].status, "submitted", "submitted payment stays");
  assert.equal(protectedStore.payments[0].tx_hash.length, 64, "transaction hash remains");
  assert.equal(protectedStore.tickets[0].payment_status, "pending", "unverified ticket stays unpaid");
  assert.equal(protectedStore.payments.length, 1, "no second payment is created");

  const raceStore = createMemoryStore();
  raceStore.events.set(9, store.events.get(9));
  raceStore.tickets.push({
    id: 92,
    user_id: USER,
    event_id: 9,
    quantity: 1,
    payment_status: "pending",
    ticket_status: "pending",
  });
  raceStore.payments.push({
    id: "race-payment",
    user_id: USER,
    event_id: 9,
    event_ticket_id: 92,
    status: "pending",
    tx_hash: null,
    confirmed_at: null,
    expires_at: "2020-01-01T00:00:00.000Z",
    payment_reference: "OLDREF3",
    amount_stroops: 400000000,
    destination_public_key: MERCHANT,
    network_passphrase: "Test SDF Network ; September 2015",
  });
  const originalInsert = raceStore.insertPayment.bind(raceStore);
  let releaseFirst;
  const firstWaiting = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let inserts = 0;
  raceStore.insertPayment = async (row) => {
    inserts += 1;
    if (inserts === 1) {
      await Promise.race([
        firstWaiting,
        new Promise((resolve) => setTimeout(resolve, 50)),
      ]);
      return originalInsert(row);
    }
    const saved = await originalInsert(row);
    releaseFirst();
    return saved;
  };
  const [first, second] = await Promise.all([
    callHandler("intent", { store: raceStore, server, token: "user-token", body: { event_id: 9, quantity: 1 } }),
    callHandler("intent", { store: raceStore, server, token: "user-token", body: { event_id: 9, quantity: 1 } }),
  ]);
  assert.equal(first.statusCode, 200, "first concurrent intent");
  assert.equal(second.statusCode, 200, "second concurrent intent");
  const open = raceStore.payments.filter((row) => ["pending", "prepared", "submitted"].includes(row.status));
  assert.equal(open.length, 1, "concurrent requests keep one open payment");
  assert.equal(raceStore.payments.find((row) => row.id === "race-payment").status, "expired", "raced payment expired");
  assert.ok(
    raceStore.tickets.every((row) => row.payment_status !== "paid"),
    "concurrency does not mark a ticket paid"
  );
  assert.equal(first.body.payment_id, second.body.payment_id, "concurrent requests share the fresh payment");
}

async function selfPaymentChecks() {
  const store = createMemoryStore();
  store.events.set(11, {
    id: 11,
    price: "10.00",
    is_public: true,
    status: "active",
    max_attendees: null,
  });
  const server = fakeTestnetServer();
  server.submitTransaction = async () => {
    throw new Error("self-payment must not be submitted");
  };
  store.tickets.push({
    id: 110,
    user_id: USER,
    event_id: 11,
    quantity: 1,
    payment_status: "pending",
    ticket_status: "pending",
  });
  store.payments.push({
    id: "33333333-3333-4333-8333-333333333333",
    user_id: USER,
    event_id: 11,
    event_ticket_id: 110,
    status: "prepared",
    source_public_key: MERCHANT,
    destination_public_key: MERCHANT,
    tx_hash: null,
    confirmed_at: null,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    payment_reference: "hkselfpayment000000000001",
    amount_stroops: 400000000,
    amount_xlm: "40.0000000",
    memo: "hkselfpayment000000000001",
    network_passphrase: "Test SDF Network ; September 2015",
  });

  const replaced = await callHandler("intent", {
    store,
    server,
    token: "user-token",
    body: { event_id: 11, quantity: 1 },
  });
  assert.equal(replaced.statusCode, 200, "self-payment no longer blocks a new intent");
  assert.equal(replaced.body.resumed, false, "self-payment is not resumed");
  assert.equal(store.payments[0].status, "failed", "self-payment is failed");
  assert.equal(store.tickets[0].payment_status, "pending", "self-payment ticket stays unpaid");

  const rejected = await callHandler("prepare", {
    store,
    server,
    token: "user-token",
    body: {
      payment_id: replaced.body.payment_id,
      source_public_key: MERCHANT,
    },
  });
  assert.equal(rejected.statusCode, 409, "payer and merchant cannot match");
  assert.equal(
    rejected.body.error,
    "The paying account must be different from the merchant account",
    "self-payment error"
  );
  assert.equal(
    store.payments.find((row) => row.id === replaced.body.payment_id).status,
    "failed",
    "rejected prepare does not stay open"
  );
  assert.ok(
    store.tickets.every((row) => row.payment_status !== "paid"),
    "self-payment does not confirm a ticket"
  );

  const blocked = await callHandler("submit", {
    store,
    server,
    token: "user-token",
    body: {
      payment_id: "33333333-3333-4333-8333-333333333333",
      signed_xdr: "self-payment",
    },
  });
  assert.equal(blocked.statusCode, 409, "prepared self-payment cannot be submitted");
  assert.equal(store.payments[0].tx_hash, null, "self-payment has no transaction");

  let networkCalled = false;
  try {
    await buildTestnetPayment({
      server: {
        serverURL: new URL(TESTNET_HORIZON),
        async loadAccount() {
          networkCalled = true;
          throw new Error("network");
        },
      },
      source: MERCHANT,
      destination: MERCHANT,
      stroops: 1000000n,
      memo: "hkselfpayment000000000002",
    });
  } catch (error) {
    assert.equal(error.code, "self-payment", "builder rejects the same account");
  }
  assert.equal(networkCalled, false, "self-payment does not reach Testnet");
}

async function fundTestnetAccount(keypair) {
  const response = await fetch(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(keypair.publicKey())}`
  );
  assert.equal(response.status, 200, "friendbot funded a disposable account");
  const server = createTestnetServer();
  let account = null;
  for (let attempt = 0; attempt < 8 && !account; attempt += 1) {
    try {
      account = await server.loadAccount(keypair.publicKey());
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  assert.ok(account, "disposable Testnet account is visible");
  return server;
}

async function distinctAccountCheckout() {
  const payer = Keypair.random();
  const merchant = Keypair.random();
  assert.ok(payer.publicKey() !== merchant.publicKey(), "payer and merchant differ");
  await fundTestnetAccount(payer);
  const server = await fundTestnetAccount(merchant);
  const store = createMemoryStore();
  store.events.set(12, {
    id: 12,
    price: "1.00",
    is_public: true,
    status: "active",
    max_attendees: null,
  });

  const created = await callHandler("intent", {
    store,
    server,
    token: "user-token",
    body: { event_id: 12, quantity: 1 },
    env: { HAVKAR_STELLAR_TICKET_MERCHANT_PUBLIC_KEY: merchant.publicKey() },
  });
  assert.equal(created.statusCode, 200, "distinct-account intent");
  assert.equal(created.body.destination, merchant.publicKey(), "merchant destination");
  assert.ok(created.body.destination !== payer.publicKey(), "intent destination is not the payer");

  const prepared = await callHandler("prepare", {
    store,
    server,
    token: "user-token",
    body: {
      payment_id: created.body.payment_id,
      source_public_key: payer.publicKey(),
    },
    env: { HAVKAR_STELLAR_TICKET_MERCHANT_PUBLIC_KEY: merchant.publicKey() },
  });
  assert.equal(prepared.statusCode, 200, "distinct-account prepare");
  const signed = TransactionBuilder.fromXDR(prepared.body.xdr, Networks.TESTNET);
  signed.sign(payer);
  const submitted = await callHandler("submit", {
    store,
    server,
    token: "user-token",
    body: {
      payment_id: created.body.payment_id,
      signed_xdr: signed.toXDR(),
    },
    env: { HAVKAR_STELLAR_TICKET_MERCHANT_PUBLIC_KEY: merchant.publicKey() },
  });
  assert.equal(submitted.statusCode, 200, "distinct-account submit");
  assert.equal(submitted.body.confirmed, true, "distinct-account ticket confirmed");
  assert.equal(/^[a-f0-9]{64}$/.test(submitted.body.tx_hash), true, "transaction hash");
  const payment = store.payments.find((row) => row.id === created.body.payment_id);
  assert.equal(payment.status, "confirmed", "payment confirmed");
  assert.equal(payment.source_public_key, payer.publicKey(), "payer recorded");
  assert.equal(payment.destination_public_key, merchant.publicKey(), "merchant recorded");
  const ticket = store.tickets.find((row) => row.id === payment.event_ticket_id);
  assert.equal(ticket.payment_status, "paid", "ticket paid");
  assert.equal(ticket.ticket_status, "valid", "ticket valid");
  assert.equal(ticket.payment_reference, submitted.body.tx_hash, "ticket receipt");

  const seen = await fetch(`${TESTNET_HORIZON}/transactions/${submitted.body.tx_hash}`);
  assert.equal(seen.status, 200, "horizon transaction");
  const body = await seen.json();
  assert.equal(body.successful, true, "horizon success");
  assert.equal(body.source_account, payer.publicKey(), "horizon payer");
  assert.equal(body.memo, created.body.payment_reference, "horizon memo");
  const operations = await fetch(`${TESTNET_HORIZON}/transactions/${submitted.body.tx_hash}/operations`);
  const operationBody = await operations.json();
  assert.equal(operationBody._embedded.records[0].from, payer.publicKey(), "horizon operation payer");
  assert.equal(operationBody._embedded.records[0].to, merchant.publicKey(), "horizon operation merchant");
  assert.equal(operationBody._embedded.records[0].amount, submitted.body.amount_xlm, "horizon amount");
  console.log(`DISTINCT_TESTNET_TICKET_HASH ${submitted.body.tx_hash}`);
}

repositoryChecks();
await localChecks();
await handlerChecks();
await expiredCheckoutChecks();
await selfPaymentChecks();
await distinctAccountCheckout();
await liveTestnet();
console.log("STELLAR_TICKET_PAYMENT_TEST_OK");
