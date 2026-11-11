import assert from "node:assert/strict";
import {
  buildXlmQuote,
  evaluateStellarCheckout,
  verifyStellarSettlement,
  MODEL_DIRECT_SPLIT,
  MODEL_PLATFORM_COLLECT,
  xlmFromEur
} from "../lib/stellar-checkout.cjs";
import {
  splitAmountsXlm,
  platformFeeEurFromFees
} from "../lib/stellar-settlement-models.cjs";

const platform = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const merchant = "G" + "B".repeat(54) + "E";
const payer = "G" + "C".repeat(54) + "E";
assert.equal(platform.length, 56);
assert.equal(merchant.length, 56);
assert.equal(payer.length, 56);
const env = { HAVKAR_STELLAR_TESTNET_DESTINATION: platform };
const now = Math.floor(Date.now() / 1000);

function rateFetch() {
  return Promise.resolve({
    ok: true,
    json: async () => ({ stellar: { eur: 0.1, last_updated_at: now } })
  });
}

const decision = evaluateStellarCheckout({
  flow: "marketplace",
  price: 100,
  idempotency_key: "direct-split-1001"
});
assert.equal(decision.ok, true);
assert.equal(decision.fees.buyerPays, 102);
assert.equal(decision.fees.sellerReceives, 97);
assert.equal(platformFeeEurFromFees(decision.fees), 5);

const split = splitAmountsXlm(decision.fees, 0.1, xlmFromEur);
assert.equal(split.merchant_amount_xlm, "970.0000000");
assert.equal(split.platform_fee_xlm, "50.0000000");
assert.equal(split.amount_xlm, "1020.0000000");

const quoted = await buildXlmQuote(decision, {
  env,
  fetchImpl: rateFetch,
  nowMs: Date.now(),
  memoBytes: Buffer.from("1234567890"),
  merchantDestination: merchant
});
assert.equal(quoted.payable, true);
assert.equal(quoted.settlement_model, MODEL_DIRECT_SPLIT);
assert.equal(quoted.merchant_destination, merchant);
assert.equal(quoted.platform_destination, platform);
assert.equal(quoted.payments.length, 2);

const legacyBlocked = await buildXlmQuote(decision, {
  env,
  fetchImpl: rateFetch,
  nowMs: Date.now(),
  memoBytes: Buffer.from("1234567890")
});
assert.equal(legacyBlocked.payable, false);
assert.equal(legacyBlocked.code, "MERCHANT_RECEIVE_KEY_REQUIRED");
assert.notEqual(legacyBlocked.settlement_model, MODEL_PLATFORM_COLLECT);

const legacyOptIn = await buildXlmQuote(decision, {
  env: { ...env, HAVKAR_XLM_ALLOW_PLATFORM_COLLECT: "true" },
  fetchImpl: rateFetch,
  nowMs: Date.now(),
  memoBytes: Buffer.from("1234567890")
});
assert.equal(legacyOptIn.settlement_model, MODEL_PLATFORM_COLLECT);
assert.equal(legacyOptIn.destination, platform);

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
          if (state.filters.tx_hash) {
            return { data: null };
          }
          if (state.filters.id && state.filters.id !== row.id) {
            return { data: null };
          }
          return { data: { ...row } };
        },
        single: async () => {
          if (state.patch) {
            if (state.filters.status && row.status !== state.filters.status) {
              return { data: null, error: { message: "conflict" } };
            }
            Object.assign(row, state.patch);
          }
          return { data: { ...row }, error: null };
        }
      };
      return api;
    }
  };
}

function horizon(memo, payments) {
  return async (url) => {
    if (String(url).includes("/payments")) {
      return { ok: true, json: async () => ({ _embedded: { records: payments } }) };
    }
    return {
      ok: true,
      json: async () => ({ successful: true, memo_type: "text", memo })
    };
  };
}

const intent = {
  id: "intent-direct",
  user_id: "user-1",
  status: "unpaid",
  expires_at: new Date(Date.now() + 60000).toISOString(),
  destination: merchant,
  memo: quoted.memo,
  amount_xlm: quoted.amount_xlm,
  settlement_model: MODEL_DIRECT_SPLIT,
  merchant_destination: merchant,
  platform_destination: platform,
  merchant_amount_xlm: quoted.merchant_amount_xlm,
  platform_fee_xlm: quoted.platform_fee_xlm,
  tx_hash: null
};

const ops = [
  {
    type: "payment",
    asset_type: "native",
    to: merchant,
    from: payer,
    amount: quoted.merchant_amount_xlm
  },
  {
    type: "payment",
    asset_type: "native",
    to: platform,
    from: payer,
    amount: quoted.platform_fee_xlm
  }
];

const settled = await verifyStellarSettlement(
  fakeAdmin(intent),
  "user-1",
  { intent_id: "intent-direct", tx_hash: "a".repeat(64) },
  { env, fetchImpl: horizon(quoted.memo, ops) }
);
assert.equal(settled.order_paid, true);
assert.equal(settled.settlement_model, MODEL_DIRECT_SPLIT);

const missingFee = await verifyStellarSettlement(
  fakeAdmin({ ...intent, status: "unpaid", tx_hash: null }),
  "user-1",
  { intent_id: "intent-direct", tx_hash: "b".repeat(64) },
  { env, fetchImpl: horizon(quoted.memo, [ops[0]]) }
);
assert.equal(missingFee.code, "PAYMENT_MISMATCH");
assert.equal(missingFee.order_paid, false);

const refundBlocked = await verifyStellarSettlement(
  fakeAdmin({ ...intent, status: "settled", payer_account: payer, tx_hash: "a".repeat(64) }),
  "user-1",
  { intent_id: "intent-direct", tx_hash: "c".repeat(64), action: "refund" },
  { env, fetchImpl: horizon(quoted.memo, []) }
);
assert.equal(refundBlocked.code, "REFUND_MODEL_UNSUPPORTED");

console.log("DIRECT_SPLIT_SETTLEMENT_TEST_OK");
