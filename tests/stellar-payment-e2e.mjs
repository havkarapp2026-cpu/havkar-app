import assert from "node:assert/strict";
import {
  Asset,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder
} from "@stellar/stellar-sdk";
import { handleStellarPayment } from "../api/stellar-payment.js";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function response() {
  return {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    }
  };
}

function createRepo() {
  const state = {
    events: [{
      id: 1,
      title: "HAVKAR test concert",
      price: "1.00",
      is_public: true,
      status: "active",
      max_attendees: 5,
      organizer: "HAVKAR"
    }, {
      id: 2,
      title: "Free gathering",
      price: "Free",
      is_public: true,
      status: "active",
      max_attendees: null,
      organizer: "HAVKAR"
    }],
    tickets: [],
    payments: [],
    refunds: [],
    audits: [],
    nextTicket: 1
  };

  return {
    state,
    async getEvent(id) {
      return state.events.find((event) => event.id === id) || null;
    },
    async countPaidTickets(eventId) {
      return state.tickets
        .filter((ticket) => ticket.event_id === eventId && ticket.payment_status === "paid")
        .reduce((sum, ticket) => sum + ticket.quantity, 0);
    },
    async findOpenIntent(userId, eventId, nowIso) {
      return state.payments.find((payment) => (
        payment.user_id === userId
        && payment.event_id === eventId
        && ["PENDING", "AWAITING_SIGNATURE", "SUBMITTED"].includes(payment.status)
        && payment.expires_at > nowIso
      )) || null;
    },
    async countRecentIntents(userId) {
      return state.payments.filter((payment) => payment.user_id === userId).length;
    },
    async insertTicket(row) {
      const ticket = { ...row, id: state.nextTicket };
      state.nextTicket += 1;
      state.tickets.push(ticket);
      return ticket;
    },
    async deletePendingTicket(id, userId) {
      state.tickets = state.tickets.filter((ticket) => !(
        ticket.id === id
        && ticket.user_id === userId
        && ticket.payment_status === "pending"
      ));
    },
    async insertPayment(row) {
      const payment = {
        ...row,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        reconciliation_state: null,
        tx_hash: null,
        source_public_key: null
      };
      state.payments.push(payment);
      return payment;
    },
    async getPaymentForUser(id, userId) {
      return state.payments.find((payment) => payment.id === id && payment.user_id === userId) || null;
    },
    async updatePayment(id, patch, allowedStatuses) {
      const payment = state.payments.find((item) => item.id === id);
      if (!payment || !allowedStatuses.includes(payment.status)) return null;
      Object.assign(payment, patch);
      return payment;
    },
    async confirmPayment(input) {
      const payment = state.payments.find((item) => item.id === input.id);
      if (!payment || !["AWAITING_SIGNATURE", "SUBMITTED"].includes(payment.status) || payment.tx_hash) {
        throw new Error("payment not confirmable");
      }
      const ticket = state.tickets.find((item) => item.id === payment.event_ticket_id);
      if (!ticket || ticket.payment_status !== "pending") {
        throw new Error("ticket not pending");
      }
      payment.status = "CONFIRMED";
      payment.tx_hash = input.txHash;
      payment.horizon_ledger = input.ledger;
      payment.source_public_key = input.source;
      payment.reconciliation_state = "matched";
      ticket.payment_status = "paid";
      ticket.ticket_status = "valid";
      ticket.payment_reference = input.txHash;
      state.audits.push({ action: "confirmed", tx_hash: input.txHash });
      return payment;
    },
    async insertRefund(row) {
      const refund = { ...row, id: crypto.randomUUID(), tx_hash: null };
      state.refunds.push(refund);
      return refund;
    },
    async getOpenRefund(paymentId, userId) {
      return state.refunds.find((refund) => (
        refund.payment_id === paymentId
        && refund.user_id === userId
        && refund.status === "REFUND_PENDING"
      )) || null;
    },
    async confirmRefund(input) {
      const refund = state.refunds.find((item) => item.id === input.id);
      if (!refund || refund.status !== "REFUND_PENDING") {
        throw new Error("refund not confirmable");
      }
      refund.status = "REFUNDED";
      refund.tx_hash = input.txHash;
      refund.horizon_ledger = input.ledger;
      const payment = state.payments.find((item) => item.id === refund.payment_id);
      payment.status = "REFUNDED";
      const ticket = state.tickets.find((item) => item.id === payment.event_ticket_id);
      ticket.payment_status = "refunded";
      ticket.ticket_status = "cancelled";
      return refund;
    },
    async insertAudit(row) {
      state.audits.push(row);
    },
    async findPaymentByHash(hash) {
      return state.payments.find((payment) => payment.tx_hash === hash || payment.prepared_hash === hash) || null;
    }
  };
}

function localEnv(extra = {}) {
  return {
    HAVKAR_STELLAR_LOCAL_TEST: "1",
    VERCEL_ENV: "test",
    ...extra
  };
}

async function call(repo, user, body, extra = {}) {
  const res = response();
  await handleStellarPayment({
    method: "POST",
    headers: {},
    body
  }, res, {
    env: localEnv(),
    repo,
    user: { id: user },
    destination: extra.destination,
    eurPerXlm: extra.eurPerXlm || "0.2500000",
    quoteSource: "test-fixture",
    reference: extra.reference,
    now: extra.now,
    fetch: extra.fetch
  });
  return res;
}

const blocked = response();
await handleStellarPayment({
  method: "POST",
  headers: {},
  body: { action: "create", service_type: "event_ticket", event_id: 1 }
}, blocked, {
  env: {
    VERCEL_ENV: "production",
    HAVKAR_STAGING_SUPABASE_URL: "https://keglioewbkgdabsizvys.supabase.co",
    HAVKAR_STAGING_SERVICE_ROLE_KEY: "sb_secret_local_test_only"
  },
  fetch: () => {
    throw new Error("production path reached Horizon");
  }
});
assert.equal(blocked.statusCode, 503);
assert.match(blocked.body.error, /disabled on production/);

const repo = createRepo();
const destination = Keypair.random();
const buyer = Keypair.random();
const created = await call(repo, USER, {
  action: "create",
  service_type: "event_ticket",
  event_id: 1,
  quantity: 1
}, { destination: destination.publicKey(), reference: "hk0123456789abcdef01234567" });
assert.equal(created.statusCode, 200);
assert.equal(created.body.payment.status, "PENDING");
assert.equal(created.body.payment.eur_amount, "1.00");
assert.equal(created.body.payment.xlm_amount, "4.0000000");
assert.equal(created.body.payment.network, "TESTNET");
assert.equal(created.body.payment.explorer_url, null);
assert.equal(repo.state.tickets[0].payment_status, "pending");

const again = await call(repo, USER, {
  action: "create",
  service_type: "event_ticket",
  event_id: 1
}, { destination: destination.publicKey() });
assert.equal(again.body.payment.id, created.body.payment.id);

const free = await call(repo, USER, {
  action: "create",
  service_type: "event_ticket",
  event_id: 2
}, { destination: destination.publicKey() });
assert.equal(free.statusCode, 409);
assert.match(free.body.error, /payable price/);

const jobs = await call(repo, USER, {
  action: "create",
  service_type: "job_listing",
  event_id: 1
}, { destination: destination.publicKey() });
assert.equal(jobs.statusCode, 409);

const hidden = await call(repo, OTHER, {
  action: "receipt",
  payment_id: created.body.payment.id
}, { destination: destination.publicKey() });
assert.equal(hidden.statusCode, 404);

const cancelled = await call(repo, USER, {
  action: "cancel",
  payment_id: created.body.payment.id
}, { destination: destination.publicKey() });
assert.equal(cancelled.body.payment.status, "CANCELLED");

async function friendbot(publicKey) {
  const response = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    throw new Error(`Friendbot HTTP ${response.status}`);
  }
  return response.json();
}

const payer = Keypair.random();
const merchant = Keypair.random();
console.log("FUND_PAYER");
await friendbot(payer.publicKey());
console.log("FUND_MERCHANT");
await friendbot(merchant.publicKey());

const liveRepo = createRepo();
const live = await call(liveRepo, USER, {
  action: "create",
  service_type: "event_ticket",
  event_id: 1,
  quantity: 1
}, {
  destination: merchant.publicKey(),
  reference: `hk${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`
});
assert.equal(live.statusCode, 200, JSON.stringify(live.body));
const prepared = await call(liveRepo, USER, {
  action: "prepare",
  payment_id: live.body.payment.id,
  source_public_key: payer.publicKey()
}, { destination: merchant.publicKey() });
assert.equal(prepared.statusCode, 200, JSON.stringify(prepared.body));
assert.equal(prepared.body.payment.status, "AWAITING_SIGNATURE");
assert.equal(prepared.body.payment.destination, merchant.publicKey());
const signed = TransactionBuilder.fromXDR(prepared.body.xdr, Networks.TESTNET);
signed.sign(payer);
const submitted = await call(liveRepo, USER, {
  action: "submit",
  payment_id: live.body.payment.id,
  signed_xdr: signed.toXDR()
}, { destination: merchant.publicKey() });
assert.equal(submitted.statusCode, 200, JSON.stringify(submitted.body));
assert.equal(submitted.body.payment.status, "CONFIRMED");
assert.match(submitted.body.payment.transaction_hash, /^[a-f0-9]{64}$/);
assert.match(submitted.body.payment.explorer_url, /^https:\/\/stellar\.expert\/explorer\/testnet\/tx\//);
const horizon = await fetch(`https://horizon-testnet.stellar.org/transactions/${submitted.body.payment.transaction_hash}`);
const record = await horizon.json();
assert.equal(record.successful, true);
assert.equal(record.memo, submitted.body.payment.memo);
const replay = await call(liveRepo, USER, {
  action: "submit",
  payment_id: live.body.payment.id,
  signed_xdr: signed.toXDR()
}, { destination: merchant.publicKey() });
assert.equal(replay.body.payment.transaction_hash, submitted.body.payment.transaction_hash);
assert.equal(liveRepo.state.audits.filter((item) => item.action === "confirmed").length, 1);

const merchantBefore = await fetch(`https://horizon-testnet.stellar.org/accounts/${merchant.publicKey()}`);
const merchantBeforeBalance = (await merchantBefore.json()).balances
  .find((item) => item.asset_type === "native").balance;
const refundRequest = await call(liveRepo, USER, {
  action: "refund",
  payment_id: live.body.payment.id
}, { destination: merchant.publicKey() });
assert.equal(refundRequest.body.refund.status, "REFUND_PENDING");
assert.equal(refundRequest.body.payment.status, "REFUND_PENDING");
const server = new Horizon.Server("https://horizon-testnet.stellar.org");
const merchantAccount = await server.loadAccount(merchant.publicKey());
const refundTransaction = new TransactionBuilder(merchantAccount, {
  fee: "100",
  networkPassphrase: Networks.TESTNET
})
  .addOperation(Operation.payment({
    destination: payer.publicKey(),
    asset: Asset.native(),
    amount: refundRequest.body.refund.amount_xlm
  }))
  .addMemo(Memo.text(refundRequest.body.refund.memo))
  .setTimeout(180)
  .build();
refundTransaction.sign(merchant);
await server.submitTransaction(refundTransaction);
const refundHash = Array.from(refundTransaction.hash(), (value) => value.toString(16).padStart(2, "0")).join("");
const refunded = await call(liveRepo, USER, {
  action: "refund",
  payment_id: live.body.payment.id,
  tx_hash: refundHash
}, { destination: merchant.publicKey() });
assert.equal(refunded.statusCode, 200, JSON.stringify(refunded.body));
assert.equal(refunded.body.payment.status, "REFUNDED");
assert.equal(liveRepo.state.tickets.find((ticket) => ticket.payment_reference === submitted.body.payment.transaction_hash).payment_status, "refunded");
const merchantAfter = await fetch(`https://horizon-testnet.stellar.org/accounts/${merchant.publicKey()}`);
const merchantAfterBalance = (await merchantAfter.json()).balances
  .find((item) => item.asset_type === "native").balance;
assert.ok(Number(merchantAfterBalance) < Number(merchantBeforeBalance));

console.log(`PAYMENT_HASH ${submitted.body.payment.transaction_hash}`);
console.log(`REFUND_HASH ${refundHash}`);
console.log("STELLAR_PAYMENT_E2E_OK");
