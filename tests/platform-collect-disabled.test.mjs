/**
 * Proves customer-facing platform_collect cannot execute while the
 * legacy code path remains available only behind exact opt-in.
 */
import assert from "node:assert/strict";
import {
  buildXlmQuote,
  evaluateStellarCheckout,
  verifyStellarSettlement,
  MODEL_DIRECT_SPLIT,
  MODEL_PLATFORM_COLLECT
} from "../lib/stellar-checkout.cjs";
import {
  allowPlatformCollectFallback,
  preferDirectSplit,
  describeSettlementModels
} from "../lib/stellar-settlement-models.cjs";

const platform = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const merchant = "G" + "B".repeat(54) + "E";
const payer = "G" + "C".repeat(54) + "E";
assert.equal(platform.length, 56);
assert.equal(merchant.length, 56);

const baseEnv = { HAVKAR_STELLAR_TESTNET_DESTINATION: platform };
const now = Math.floor(Date.now() / 1000);

function rateFetch() {
  return Promise.resolve({
    ok: true,
    json: async () => ({ stellar: { eur: 0.1, last_updated_at: now } })
  });
}

function fakeAdmin(seed) {
  const row = { ...seed };
  return {
    from() {
      const state = { filters: {}, patch: null };
      const api = {
        select() {
          return api;
        },
        eq(field, value) {
          state.filters[field] = value;
          return api;
        },
        neq() {
          return api;
        },
        update(patch) {
          state.patch = patch;
          return api;
        },
        maybeSingle: async () => {
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

assert.equal(allowPlatformCollectFallback({}), false);
assert.equal(allowPlatformCollectFallback({ HAVKAR_XLM_ALLOW_PLATFORM_COLLECT: "false" }), false);
assert.equal(allowPlatformCollectFallback({ HAVKAR_XLM_ALLOW_PLATFORM_COLLECT: "true" }), true);
assert.equal(preferDirectSplit({}), true);

const described = describeSettlementModels();
assert.equal(described.preferred, MODEL_DIRECT_SPLIT);
assert.equal(described.platform_collect_customer_facing, "disabled_by_default");

const marketplace = evaluateStellarCheckout({
  flow: "marketplace",
  price: 50,
  idempotency_key: "pc-off-market-1"
});
assert.equal(marketplace.ok, true);

const events = evaluateStellarCheckout({
  flow: "events",
  price: 50,
  idempotency_key: "pc-off-events-1"
});
assert.equal(events.ok, true);

for (const decision of [marketplace, events]) {
  const blocked = await buildXlmQuote(decision, {
    env: baseEnv,
    fetchImpl: rateFetch,
    nowMs: Date.now(),
    memoBytes: Buffer.from("1234567890")
  });
  assert.equal(blocked.payable, false);
  assert.equal(blocked.order_paid, false);
  assert.equal(blocked.code, "MERCHANT_RECEIVE_KEY_REQUIRED");
  assert.notEqual(blocked.settlement_model, MODEL_PLATFORM_COLLECT);
}

const directOffNoCollect = await buildXlmQuote(marketplace, {
  env: {
    ...baseEnv,
    HAVKAR_XLM_DIRECT_SPLIT: "false",
    merchantDestination: merchant
  },
  fetchImpl: rateFetch,
  nowMs: Date.now(),
  memoBytes: Buffer.from("1234567890"),
  merchantDestination: merchant
});
assert.equal(directOffNoCollect.payable, false);
assert.equal(directOffNoCollect.code, "PLATFORM_COLLECT_DISABLED");
assert.notEqual(directOffNoCollect.settlement_model, MODEL_PLATFORM_COLLECT);

const directOk = await buildXlmQuote(marketplace, {
  env: baseEnv,
  fetchImpl: rateFetch,
  nowMs: Date.now(),
  memoBytes: Buffer.from("1234567890"),
  merchantDestination: merchant
});
assert.equal(directOk.payable, true);
assert.equal(directOk.settlement_model, MODEL_DIRECT_SPLIT);
assert.equal(directOk.payments.length, 2);
assert.ok(!directOk.payments.some((p) => p.role === "platform_collect"));

const legacyIntent = {
  id: "intent-pc",
  user_id: "user-1",
  status: "unpaid",
  expires_at: new Date(Date.now() + 60000).toISOString(),
  destination: platform,
  memo: "legacycollect",
  amount_xlm: "510.0000000",
  settlement_model: MODEL_PLATFORM_COLLECT,
  tx_hash: null
};

const settleBlocked = await verifyStellarSettlement(
  fakeAdmin(legacyIntent),
  "user-1",
  { intent_id: "intent-pc", tx_hash: "a".repeat(64) },
  {
    env: baseEnv,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        successful: true,
        memo_type: "text",
        memo: "legacycollect",
        _embedded: {
          records: [
            {
              type: "payment",
              asset_type: "native",
              to: platform,
              from: payer,
              amount: "510.0000000"
            }
          ]
        }
      })
    })
  }
);
assert.equal(settleBlocked.code, "PLATFORM_COLLECT_DISABLED");
assert.equal(settleBlocked.order_paid, false);
assert.equal(settleBlocked.paid, false);

const optIn = {
  ...baseEnv,
  HAVKAR_XLM_ALLOW_PLATFORM_COLLECT: "true"
};
const legacyQuote = await buildXlmQuote(marketplace, {
  env: optIn,
  fetchImpl: rateFetch,
  nowMs: Date.now(),
  memoBytes: Buffer.from("1234567890")
});
assert.equal(legacyQuote.payable, true);
assert.equal(legacyQuote.settlement_model, MODEL_PLATFORM_COLLECT);
assert.equal(legacyQuote.destination, platform);
assert.equal(legacyQuote.payments[0].role, "platform_collect");

console.log("PLATFORM_COLLECT_DISABLED_TEST_OK");
