/**
 * HAVKAR-owned prepaid XLM products (jobs_listing) settle to the platform
 * destination without requiring a seller receive key and without enabling
 * legacy marketplace platform_collect.
 */
import assert from "node:assert/strict";
import {
  MODEL_PLATFORM_PREPAID,
  MODEL_PLATFORM_COLLECT,
  MODEL_DIRECT_SPLIT,
  isPlatformPrepaidFlow,
  describeSettlementModels
} from "../lib/stellar-settlement-models.cjs";
import {
  evaluateStellarCheckout,
  buildXlmQuote,
  quoteFeesForFlow,
  quotePlatformPrepaidFees,
  verifyStellarSettlement
} from "../lib/stellar-checkout.cjs";

assert.equal(isPlatformPrepaidFlow("jobs_listing"), true);
assert.equal(isPlatformPrepaidFlow("business_listing"), true);
assert.equal(isPlatformPrepaidFlow("ai_credits"), true);
assert.equal(isPlatformPrepaidFlow("marketplace"), false);

const prepaidFees = quotePlatformPrepaidFees(9.99);
assert.equal(prepaidFees.price, 9.99);
assert.equal(prepaidFees.buyerPays, 9.99);
assert.equal(prepaidFees.sellerReceives, 0);
assert.equal(prepaidFees.buyerFee, 0);

const flowFees = quoteFeesForFlow("jobs_listing", 9.99);
assert.equal(flowFees.buyerPays, 9.99);
assert.notEqual(quoteFeesForFlow("marketplace", 9.99).buyerPays, 9.99);

const described = describeSettlementModels();
assert.ok(described.platform_prepaid_flows.includes("jobs_listing"));
assert.ok(described.models[MODEL_PLATFORM_PREPAID]);

const destination = "GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM";
const payer = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const baseEnv = {
  HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true",
  HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION: "true",
  HAVKAR_STELLAR_MAINNET_DESTINATION: destination
};

const decision = evaluateStellarCheckout(
  {
    flow: "jobs_listing",
    price: 9.99,
    idempotency_key: "jobs-prepaid-quote-1",
    network: "mainnet",
    subject_id: "11"
  },
  new Date(),
  baseEnv
);
assert.equal(decision.ok, true);
assert.equal(decision.fees.buyerPays, 9.99);

const now = Math.floor(Date.now() / 1000);
const rateFetch = async (url) => {
  if (String(url).includes("/accounts/")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: destination,
        balances: [{ asset_type: "native", balance: "10" }]
      })
    };
  }
  return {
    ok: true,
    json: async () => ({ stellar: { eur: 0.117675, last_updated_at: now } })
  };
};

const quoted = await buildXlmQuote(decision, {
  env: baseEnv,
  fetchImpl: rateFetch,
  nowMs: Date.now(),
  memoBytes: Buffer.from("jobsprepay01")
});
assert.equal(quoted.payable, true);
assert.equal(quoted.paid, false);
assert.equal(quoted.settlement_model, MODEL_PLATFORM_PREPAID);
assert.equal(quoted.destination, destination);
assert.equal(quoted.payments.length, 1);
assert.equal(quoted.payments[0].role, "platform_prepaid");
assert.ok(Number(quoted.amount_xlm) > 0);
assert.notEqual(quoted.settlement_model, MODEL_DIRECT_SPLIT);
assert.notEqual(quoted.settlement_model, MODEL_PLATFORM_COLLECT);

// Marketplace still requires merchant key when platform_collect is off.
const marketDecision = evaluateStellarCheckout(
  {
    flow: "marketplace",
    price: 50,
    idempotency_key: "mkt-still-blocked-1",
    network: "mainnet"
  },
  new Date(),
  baseEnv
);
const marketBlocked = await buildXlmQuote(marketDecision, {
  env: baseEnv,
  fetchImpl: rateFetch,
  nowMs: Date.now(),
  memoBytes: Buffer.from("mktblocked01")
});
assert.equal(marketBlocked.payable, false);
assert.equal(marketBlocked.code, "MERCHANT_RECEIVE_KEY_REQUIRED");
assert.notEqual(marketBlocked.settlement_model, MODEL_PLATFORM_COLLECT);

function fakeAdmin(seed) {
  const row = { ...seed };
  return {
    from() {
      const state = { filters: {}, patch: null, excludeId: null };
      const api = {
        select() {
          return api;
        },
        eq(field, value) {
          state.filters[field] = value;
          return api;
        },
        neq(field, value) {
          if (field === "id") {
            state.excludeId = value;
          }
          return api;
        },
        update(patch) {
          state.patch = patch;
          return api;
        },
        maybeSingle: async () => {
          // Replay lookup: .eq("tx_hash", ...).neq("id", intent.id)
          if (Object.prototype.hasOwnProperty.call(state.filters, "tx_hash")) {
            return { data: null };
          }
          if (state.filters.id && state.filters.id !== row.id) {
            return { data: null };
          }
          return { data: { ...row } };
        },
        single: async () => {
          if (state.patch) {
            Object.assign(row, state.patch);
          }
          return { data: { ...row }, error: null };
        }
      };
      return api;
    }
  };
}

const intent = {
  id: "intent-prepaid-1",
  user_id: "user-1",
  flow: "jobs_listing",
  status: "unpaid",
  expires_at: new Date(Date.now() + 600000).toISOString(),
  destination,
  memo: "jobsprepay01",
  amount_xlm: quoted.amount_xlm,
  amount: 9.99,
  currency: "EUR",
  network: "mainnet",
  settlement_model: MODEL_PLATFORM_PREPAID,
  merchant_destination: null,
  platform_destination: destination,
  merchant_amount_xlm: null,
  platform_fee_xlm: quoted.amount_xlm,
  tx_hash: null,
  payer_account: null
};

const settleFetch = async (url) => {
  const path = String(url);
  if (path.includes("/payments")) {
    return {
      ok: true,
      json: async () => ({
        _embedded: {
          records: [
            {
              type: "payment",
              asset_type: "native",
              to: destination,
              from: payer,
              amount: quoted.amount_xlm
            }
          ]
        }
      })
    };
  }
  if (path.includes("/transactions/")) {
    return {
      ok: true,
      json: async () => ({
        successful: true,
        memo_type: "text",
        memo: intent.memo,
        fee_charged: "100",
        created_at: new Date().toISOString()
      })
    };
  }
  return rateFetch(url);
};

const settled = await verifyStellarSettlement(
  fakeAdmin(intent),
  "user-1",
  { intent_id: intent.id, tx_hash: "a".repeat(64) },
  { env: baseEnv, fetchImpl: settleFetch }
);
assert.equal(settled.ok, true);
assert.equal(settled.paid, true);
assert.equal(settled.settlement, "settled");
assert.equal(settled.settlement_model, MODEL_PLATFORM_PREPAID);

// Legacy marketplace platform_collect still blocked without opt-in.
const legacyBlocked = await verifyStellarSettlement(
  fakeAdmin({
    ...intent,
    id: "intent-pc",
    flow: "marketplace",
    settlement_model: MODEL_PLATFORM_COLLECT,
    memo: "legacycollect"
  }),
  "user-1",
  { intent_id: "intent-pc", tx_hash: "b".repeat(64) },
  { env: baseEnv, fetchImpl: settleFetch }
);
assert.equal(legacyBlocked.code, "PLATFORM_COLLECT_DISABLED");
assert.equal(legacyBlocked.paid, false);

console.log("xlm-platform-prepaid.test.mjs: ok");
