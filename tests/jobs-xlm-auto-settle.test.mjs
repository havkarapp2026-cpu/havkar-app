/**
 * Jobs XLM auto-settle security gates:
 * - match amount + destination + memo + expiry
 * - reject replay / wrong memo / expired
 * - activate pending_payment once only
 * - public Basic tariff stays €9.99
 */
import assert from "node:assert/strict";
import {
  discoverMatchingTxHash,
  settleJobsIntent,
  autoSettleJobsXlmIntents,
  authorizeAutoSettleRequest
} from "../lib/jobs-xlm-auto-settle.cjs";
import billing from "../havkar-job-billing.js";

assert.equal(billing.ORDINARY_PLANS.Basic.eur, 9.99);
assert.equal(billing.ORDINARY_PLANS.Basic.cents, 999);

const DEST = "GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM";
const PAYER = "GBQOQQC5GXGFDHOG4QWJCKLHZRAQQV436OSJE7YDSBESKFSE3B4LTLKD";
const MEMO = "ab512c8d6580e92fc9b6";
const AMOUNT = "8.6149711";
const TX =
  "ed0971ed6af58f1681d2960c78497fbd8b8f198bc07b317cae9f808e127081c8";

function makeIntent(overrides) {
  const now = Date.now();
  return Object.assign(
    {
      id: "intent-1",
      user_id: "user-1",
      flow: "jobs_listing",
      status: "unpaid",
      subject_id: "13",
      destination: DEST,
      memo: MEMO,
      amount_xlm: AMOUNT,
      network: "mainnet",
      settlement_model: "platform_prepaid",
      created_at: new Date(now - 60_000).toISOString(),
      expires_at: new Date(now + 30 * 60_000).toISOString(),
      tx_hash: null
    },
    overrides || {}
  );
}

function horizonFetchFactory(opts) {
  const settings = opts || {};
  const memo = settings.memo !== undefined ? settings.memo : MEMO;
  const amount = settings.amount !== undefined ? settings.amount : AMOUNT;
  const successful = settings.successful !== false;
  const createdAt =
    settings.createdAt || new Date().toISOString().replace(/\.\d+Z$/, "Z");

  return async function fetchImpl(url) {
    const u = String(url);
    if (u.includes("/payments?") && u.includes("/accounts/")) {
      return {
        ok: true,
        json: async () => ({
          _embedded: {
            records: [
              {
                type: "payment",
                asset_type: "native",
                from: PAYER,
                to: DEST,
                amount: amount,
                transaction_hash: TX,
                transaction_successful: successful,
                created_at: createdAt
              }
            ]
          }
        })
      };
    }
    if (u.includes("/transactions/" + TX + "/payments")) {
      return {
        ok: true,
        json: async () => ({
          _embedded: {
            records: [
              {
                type: "payment",
                asset_type: "native",
                from: PAYER,
                to: DEST,
                amount: amount
              }
            ]
          }
        })
      };
    }
    if (u.includes("/transactions/" + TX)) {
      return {
        ok: true,
        json: async () => ({
          hash: TX,
          successful: successful,
          memo_type: "text",
          memo: memo,
          created_at: createdAt
        })
      };
    }
    return { ok: false, json: async () => ({}) };
  };
}

function fakeAdmin(seedIntent, seedJob) {
  const intent = { ...seedIntent };
  const job = { ...(seedJob || { id: "13", user_id: intent.user_id, status: "pending_payment", expires_at: null }) };
  const intentsByTx = {};

  return {
    _intent: intent,
    _job: job,
    from(table) {
      const state = { table, filters: {}, patch: null, neq: null };
      const api = {
        select() {
          return api;
        },
        eq(field, value) {
          state.filters[field] = value;
          return api;
        },
        neq(field, value) {
          state.neq = { field, value };
          return api;
        },
        gt() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        update(patch) {
          state.patch = patch;
          return api;
        },
        maybeSingle: async () => {
          if (state.table === "marketplace_payment_intents") {
            if (state.filters.tx_hash) {
              const other = intentsByTx[state.filters.tx_hash];
              if (other && other.id !== intent.id) return { data: other };
              return { data: null };
            }
            if (state.filters.id && state.filters.id !== intent.id) {
              return { data: null };
            }
            if (state.filters.user_id && state.filters.user_id !== intent.user_id) {
              return { data: null };
            }
            return { data: { ...intent } };
          }
          if (state.table === "jobs") {
            if (state.filters.id && String(state.filters.id) !== String(job.id)) {
              return { data: null };
            }
            if (state.filters.user_id && state.filters.user_id !== job.user_id) {
              return { data: null };
            }
            if (
              state.filters.status &&
              String(job.status) !== String(state.filters.status) &&
              !state.patch
            ) {
              return { data: null };
            }
            return { data: { ...job } };
          }
          return { data: null };
        },
        single: async () => {
          if (state.table === "marketplace_payment_intents" && state.patch) {
            if (state.filters.status && intent.status !== state.filters.status) {
              return { data: null, error: { message: "conflict" } };
            }
            Object.assign(intent, state.patch);
            if (intent.tx_hash) intentsByTx[intent.tx_hash] = { ...intent };
            return { data: { id: intent.id, status: intent.status }, error: null };
          }
          return { data: null, error: { message: "missing" } };
        }
      };

      // Thenable for query builder ending without maybeSingle (list load)
      api.then = undefined;
      const listPromise = Promise.resolve().then(async () => {
        if (state.table === "marketplace_payment_intents" && !state.patch) {
          if (state.filters.flow && state.filters.flow !== intent.flow) {
            return { data: [], error: null };
          }
          if (state.filters.status && state.filters.status !== intent.status) {
            return { data: [], error: null };
          }
          if (state.filters.user_id && state.filters.user_id !== intent.user_id) {
            return { data: [], error: null };
          }
          if (state.filters.id && state.filters.id !== intent.id) {
            return { data: [], error: null };
          }
          return { data: [{ ...intent }], error: null };
        }
        if (state.table === "jobs" && state.patch) {
          if (state.filters.status && job.status !== state.filters.status) {
            return { data: null, error: null };
          }
          if (state.filters.user_id && job.user_id !== state.filters.user_id) {
            return { data: null, error: null };
          }
          Object.assign(job, state.patch);
          return {
            data: { id: job.id, status: job.status, expires_at: job.expires_at },
            error: null
          };
        }
        return { data: [], error: null };
      });

      // Support both await query and .maybeSingle()
      api.then = listPromise.then.bind(listPromise);
      api.catch = listPromise.catch.bind(listPromise);

      // jobs update chain ends with maybeSingle after update().eq...
      const originalMaybe = api.maybeSingle;
      api.maybeSingle = async () => {
        if (state.table === "jobs" && state.patch) {
          if (state.filters.status && job.status !== state.filters.status) {
            return { data: null };
          }
          if (state.filters.user_id && job.user_id !== state.filters.user_id) {
            return { data: null };
          }
          Object.assign(job, state.patch);
          return {
            data: { id: job.id, status: job.status, expires_at: job.expires_at }
          };
        }
        return originalMaybe();
      };

      return api;
    }
  };
}

// Discover: exact match
{
  const intent = makeIntent();
  const found = await discoverMatchingTxHash(intent, {
    fetchImpl: horizonFetchFactory()
  });
  assert.equal(found.ok, true);
  assert.equal(found.tx_hash, TX);
}

// Discover: memo mismatch
{
  const intent = makeIntent();
  const found = await discoverMatchingTxHash(intent, {
    fetchImpl: horizonFetchFactory({ memo: "deadbeefdeadbeefdead" })
  });
  assert.equal(found.ok, false);
  assert.equal(found.code, "NO_MATCHING_PAYMENT");
}

// Discover: amount mismatch
{
  const intent = makeIntent();
  const found = await discoverMatchingTxHash(intent, {
    fetchImpl: horizonFetchFactory({ amount: "1.0000000" })
  });
  assert.equal(found.ok, false);
}

// Discover: expired quote rejects later payment
{
  const intent = makeIntent({
    expires_at: new Date(Date.now() - 60_000).toISOString()
  });
  const found = await discoverMatchingTxHash(intent, {
    fetchImpl: horizonFetchFactory({
      createdAt: new Date().toISOString().replace(/\.\d+Z$/, "Z")
    })
  });
  assert.equal(found.ok, false);
}

// Cron auth
assert.equal(
  authorizeAutoSettleRequest(
    { headers: { "x-vercel-cron": "1" } },
    {}
  ).ok,
  true
);
assert.equal(
  authorizeAutoSettleRequest(
    { headers: { authorization: "Bearer secret-cron" } },
    { CRON_SECRET: "secret-cron" }
  ).ok,
  true
);
assert.equal(
  authorizeAutoSettleRequest({ headers: {} }, { CRON_SECRET: "secret-cron" })
    .ok,
  false
);

// End-to-end settle + activate once
{
  const intent = makeIntent();
  const admin = fakeAdmin(intent, {
    id: "13",
    user_id: "user-1",
    status: "pending_payment",
    expires_at: null
  });
  const env = {
    HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true",
    HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION: "true",
    HAVKAR_STELLAR_MAINNET_DESTINATION: DEST,
    HAVKAR_CRYPTO_GEO_ENFORCEMENT: "false"
  };
  const outcome = await settleJobsIntent(admin, intent, {
    fetchImpl: horizonFetchFactory(),
    env
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.paid, true);
  assert.equal(outcome.activated, true);
  assert.equal(outcome.fulfillment, "jobs_listing_activated");
  assert.equal(outcome.tx_hash, TX);
  assert.equal(admin._intent.status, "settled");
  assert.equal(admin._job.status, "active");

  // Second pass is idempotent — no double-charge path; already settled.
  admin._intent.status = "settled";
  admin._intent.tx_hash = TX;
  const again = await settleJobsIntent(admin, admin._intent, {
    fetchImpl: horizonFetchFactory(),
    env
  });
  assert.equal(again.ok, true);
  assert.equal(again.idempotent, true);
  assert.equal(again.activated, true);
}

// Wrong memo cannot activate
{
  const intent = makeIntent();
  const admin = fakeAdmin(intent);
  const env = {
    HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true",
    HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION: "true",
    HAVKAR_STELLAR_MAINNET_DESTINATION: DEST,
    HAVKAR_CRYPTO_GEO_ENFORCEMENT: "false"
  };
  const outcome = await settleJobsIntent(admin, intent, {
    txHash: TX,
    fetchImpl: horizonFetchFactory({ memo: "ffffffffffffffffffffff" }),
    env
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.activated, false);
  assert.equal(admin._job.status, "pending_payment");
  assert.equal(admin._intent.status, "unpaid");
}

// Sweep scopes to user
{
  const intent = makeIntent();
  const admin = fakeAdmin(intent);
  const env = {
    HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true",
    HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION: "true",
    HAVKAR_STELLAR_MAINNET_DESTINATION: DEST,
    HAVKAR_CRYPTO_GEO_ENFORCEMENT: "false"
  };
  const sweep = await autoSettleJobsXlmIntents(admin, {
    userId: "user-1",
    fetchImpl: horizonFetchFactory(),
    env
  });
  assert.equal(sweep.ok, true);
  assert.equal(sweep.settled, 1);
  assert.equal(sweep.activated, 1);
}

console.log("JOBS_XLM_AUTO_SETTLE_TEST_OK");
