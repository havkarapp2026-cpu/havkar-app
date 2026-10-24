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
import { handleStellarPayment } from "../api/stellar-payment.mjs";
import {
  APPROVED_RATE_PROVIDERS,
  KRAKEN_XLMEUR_URL,
  RATE_PROVIDER_KRAKEN_XLMEUR,
  STAGING_SUPABASE_URL
} from "../lib/stellar-payment-core.mjs";

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
    jobs: [],
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
    async getJob(id) {
      return state.jobs.find((job) => String(job.id) === String(id)) || null;
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
        && (payment.service_type || "event_ticket") === "event_ticket"
        && ["PENDING", "AWAITING_SIGNATURE", "SUBMITTED"].includes(payment.status)
        && payment.expires_at > nowIso
      )) || null;
    },
    async findOpenServiceIntent(userId, serviceType, serviceId, nowIso) {
      return state.payments.find((payment) => (
        payment.user_id === userId
        && payment.service_type === serviceType
        && String(payment.service_id) === String(serviceId)
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
      if (payment.service_type === "job_listing") {
        const job = state.jobs.find((item) => String(item.id) === String(payment.service_id));
        if (!job || job.user_id !== payment.user_id || job.status !== "pending_payment") {
          throw new Error("job not pending");
        }
        payment.status = "CONFIRMED";
        payment.tx_hash = input.txHash;
        payment.horizon_ledger = input.ledger;
        payment.source_public_key = input.source;
        payment.reconciliation_state = "matched";
        job.status = "active";
        state.audits.push({ action: "confirmed", tx_hash: input.txHash });
        return payment;
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
      if (payment.service_type === "job_listing") {
        const job = state.jobs.find((item) => String(item.id) === String(payment.service_id));
        if (!job || job.status !== "active") {
          throw new Error("job not active");
        }
        job.status = "pending_payment";
        return refund;
      }
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

const unknownService = await call(repo, USER, {
  action: "create",
  service_type: "wallet_deposit",
  service_id: "1"
}, { destination: destination.publicKey() });
assert.equal(unknownService.statusCode, 409);
assert.match(unknownService.body.error, /not payable with XLM/);

const missingJob = await call(repo, USER, {
  action: "create",
  service_type: "job_listing",
  service_id: "77"
}, { destination: destination.publicKey() });
assert.equal(missingJob.statusCode, 409);

repo.state.jobs.push({
  id: 78,
  user_id: OTHER,
  title: "Other role",
  company: "Other",
  status: "pending_payment",
  plan: "Basic",
  monthly_fee: "9.99"
});
const foreignJob = await call(repo, USER, {
  action: "create",
  service_type: "job_listing",
  service_id: "78"
}, { destination: destination.publicKey() });
assert.equal(foreignJob.statusCode, 409);

repo.state.jobs.push({
  id: 79,
  user_id: USER,
  title: "Tampered role",
  company: "HAVKAR",
  status: "pending_payment",
  plan: "Basic",
  monthly_fee: "1.00"
});
const tamperedJob = await call(repo, USER, {
  action: "create",
  service_type: "job_listing",
  service_id: "79"
}, { destination: destination.publicKey() });
assert.equal(tamperedJob.statusCode, 409);

repo.state.jobs.push({
  id: 77,
  user_id: USER,
  title: "Kitchen role",
  company: "HAVKAR",
  status: "pending_payment",
  plan: "Basic",
  monthly_fee: "9.99"
});
const jobCreated = await call(repo, USER, {
  action: "create",
  service_type: "job_listing",
  service_id: "77"
}, { destination: destination.publicKey() });
assert.equal(jobCreated.statusCode, 200, JSON.stringify(jobCreated.body));
assert.equal(jobCreated.body.payment.service_type, "job_listing");
assert.equal(jobCreated.body.payment.eur_amount, "9.99");
assert.equal(jobCreated.body.payment.service_name, "Kitchen role");
assert.equal(repo.state.jobs.find((job) => job.id === 77).status, "pending_payment");
const jobAgain = await call(repo, USER, {
  action: "create",
  service_type: "job_listing",
  service_id: "77"
}, { destination: destination.publicKey() });
assert.equal(jobAgain.body.payment.id, jobCreated.body.payment.id);

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

liveRepo.state.jobs.push({
  id: 77,
  user_id: USER,
  title: "Kitchen role",
  company: "HAVKAR",
  status: "pending_payment",
  plan: "Basic",
  monthly_fee: "9.99"
});
const jobLive = await call(liveRepo, USER, {
  action: "create",
  service_type: "job_listing",
  service_id: "77"
}, {
  destination: merchant.publicKey(),
  reference: `hk${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`
});
assert.equal(jobLive.statusCode, 200, JSON.stringify(jobLive.body));
assert.equal(liveRepo.state.jobs[0].status, "pending_payment");
const jobPrepared = await call(liveRepo, USER, {
  action: "prepare",
  payment_id: jobLive.body.payment.id,
  source_public_key: payer.publicKey()
}, { destination: merchant.publicKey() });
assert.equal(jobPrepared.statusCode, 200, JSON.stringify(jobPrepared.body));
const jobSigned = TransactionBuilder.fromXDR(jobPrepared.body.xdr, Networks.TESTNET);
jobSigned.sign(payer);
const jobSubmitted = await call(liveRepo, USER, {
  action: "submit",
  payment_id: jobLive.body.payment.id,
  signed_xdr: jobSigned.toXDR()
}, { destination: merchant.publicKey() });
assert.equal(jobSubmitted.statusCode, 200, JSON.stringify(jobSubmitted.body));
assert.equal(jobSubmitted.body.payment.status, "CONFIRMED");
assert.equal(liveRepo.state.jobs[0].status, "active");
const jobHorizon = await fetch(`https://horizon-testnet.stellar.org/transactions/${jobSubmitted.body.payment.transaction_hash}`);
const jobRecord = await jobHorizon.json();
assert.equal(jobRecord.successful, true);
assert.equal(jobRecord.memo, jobSubmitted.body.payment.memo);
console.log(`JOB_PAYMENT_HASH ${jobSubmitted.body.payment.transaction_hash}`);
console.log("STELLAR_PAYMENT_E2E_OK");

function stagingEnv(destination) {
  return {
    VERCEL_ENV: "preview",
    HAVKAR_STAGING_SUPABASE_URL: STAGING_SUPABASE_URL,
    HAVKAR_STAGING_SERVICE_ROLE_KEY: "sb_secret_local_test_only",
    HAVKAR_STELLAR_TESTNET_DESTINATION: destination,
    HAVKAR_XLM_RATE_PROVIDER: RATE_PROVIDER_KRAKEN_XLMEUR
  };
}

function mockAdmin(userId) {
  return {
    auth: {
      async getUser(token) {
        if (token === "session-ok") {
          return { data: { user: { id: userId } }, error: null };
        }

        return { data: { user: null }, error: { message: "bad session" } };
      }
    }
  };
}

async function routedFetch(url, options) {
  if (String(url) === KRAKEN_XLMEUR_URL) {
    return {
      ok: true,
      status: 200,
      async json() {
        return { error: [], result: { XXLMZEUR: { c: ["0.20000000", "1"] } } };
      }
    };
  }

  return fetch(url, options);
}

async function authCall(repo, body) {
  const res = response();
  await handleStellarPayment({
    method: "POST",
    headers: { authorization: "Bearer session-ok" },
    body
  }, res, {
    env: stagingEnv(merchant.publicKey()),
    admin: mockAdmin(USER),
    repo,
    fetch: routedFetch
  });
  return res;
}

APPROVED_RATE_PROVIDERS.add(RATE_PROVIDER_KRAKEN_XLMEUR);
try {
  const production = response();
  await handleStellarPayment({
    method: "POST",
    headers: { authorization: "Bearer session-ok" },
    body: { action: "create", service_type: "event_ticket", event_id: 1 }
  }, production, {
    env: {
      ...stagingEnv(merchant.publicKey()),
      VERCEL_ENV: "production"
    },
    admin: {
      auth: {
        async getUser() {
          throw new Error("production auth reached");
        }
      }
    },
    fetch: () => {
      throw new Error("production rate reached");
    }
  });
  assert.equal(production.statusCode, 503);
  assert.match(production.body.error, /disabled on production/);

  const anonymous = response();
  let anonymousFetches = 0;
  await handleStellarPayment({
    method: "POST",
    headers: {},
    body: { action: "create", service_type: "event_ticket", event_id: 1, quantity: 1 }
  }, anonymous, {
    env: stagingEnv(merchant.publicKey()),
    admin: mockAdmin(USER),
    repo: createRepo(),
    fetch: () => {
      anonymousFetches += 1;
      throw new Error("anonymous rate reached");
    }
  });
  assert.equal(anonymous.statusCode, 401);
  assert.match(anonymous.body.error, /Authentication required/);
  assert.equal(anonymousFetches, 0);

  const rejected = response();
  await handleStellarPayment({
    method: "POST",
    headers: { authorization: "Bearer nope" },
    body: { action: "create", service_type: "event_ticket", event_id: 1 }
  }, rejected, {
    env: stagingEnv(merchant.publicKey()),
    admin: mockAdmin(USER),
    repo: createRepo(),
    fetch: routedFetch
  });
  assert.equal(rejected.statusCode, 401);
  assert.match(rejected.body.error, /Invalid or expired session/);

  const authRepo = createRepo();
  const authCreated = await authCall(authRepo, {
    action: "create",
    service_type: "event_ticket",
    event_id: 1,
    quantity: 1
  });
  assert.equal(authCreated.statusCode, 200, JSON.stringify(authCreated.body));
  assert.equal(authCreated.body.payment.xlm_amount, "5.0000000");
  assert.equal(authCreated.body.payment.quote_source, RATE_PROVIDER_KRAKEN_XLMEUR);
  assert.equal(authCreated.body.payment.destination, merchant.publicKey());
  const authCancelled = await authCall(authRepo, {
    action: "cancel",
    payment_id: authCreated.body.payment.id
  });
  assert.equal(authCancelled.statusCode, 200, JSON.stringify(authCancelled.body));
  assert.equal(authCancelled.body.payment.status, "CANCELLED");

  const authLive = await authCall(authRepo, {
    action: "create",
    service_type: "event_ticket",
    event_id: 1,
    quantity: 1
  });
  assert.equal(authLive.statusCode, 200, JSON.stringify(authLive.body));
  const authPrepared = await authCall(authRepo, {
    action: "prepare",
    payment_id: authLive.body.payment.id,
    source_public_key: payer.publicKey()
  });
  assert.equal(authPrepared.statusCode, 200, JSON.stringify(authPrepared.body));
  const authSigned = TransactionBuilder.fromXDR(authPrepared.body.xdr, Networks.TESTNET);
  authSigned.sign(payer);
  const authSubmitted = await authCall(authRepo, {
    action: "submit",
    payment_id: authLive.body.payment.id,
    signed_xdr: authSigned.toXDR()
  });
  assert.equal(authSubmitted.statusCode, 200, JSON.stringify(authSubmitted.body));
  assert.equal(authSubmitted.body.payment.status, "CONFIRMED");
  const authRefundRequest = await authCall(authRepo, {
    action: "refund",
    payment_id: authLive.body.payment.id
  });
  assert.equal(authRefundRequest.body.refund.status, "REFUND_PENDING");
  const authServer = new Horizon.Server("https://horizon-testnet.stellar.org");
  const authMerchant = await authServer.loadAccount(merchant.publicKey());
  const authRefundTransaction = new TransactionBuilder(authMerchant, {
    fee: "100",
    networkPassphrase: Networks.TESTNET
  })
    .addOperation(Operation.payment({
      destination: payer.publicKey(),
      asset: Asset.native(),
      amount: authRefundRequest.body.refund.amount_xlm
    }))
    .addMemo(Memo.text(authRefundRequest.body.refund.memo))
    .setTimeout(180)
    .build();
  authRefundTransaction.sign(merchant);
  await authServer.submitTransaction(authRefundTransaction);
  const authRefundHash = Array.from(
    authRefundTransaction.hash(),
    (value) => value.toString(16).padStart(2, "0")
  ).join("");
  const authRefunded = await authCall(authRepo, {
    action: "refund",
    payment_id: authLive.body.payment.id,
    tx_hash: authRefundHash
  });
  assert.equal(authRefunded.statusCode, 200, JSON.stringify(authRefunded.body));
  assert.equal(authRefunded.body.payment.status, "REFUNDED");
  console.log(`AUTH_PAYMENT_HASH ${authSubmitted.body.payment.transaction_hash}`);
  console.log(`AUTH_REFUND_HASH ${authRefundHash}`);
  console.log("STELLAR_PAYMENT_AUTH_OK");
} finally {
  APPROVED_RATE_PROVIDERS.add(RATE_PROVIDER_KRAKEN_XLMEUR);
}

assert.equal(APPROVED_RATE_PROVIDERS.has(RATE_PROVIDER_KRAKEN_XLMEUR), true);
