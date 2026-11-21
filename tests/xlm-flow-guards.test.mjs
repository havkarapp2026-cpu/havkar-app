import assert from "node:assert/strict";
import fs from "node:fs";
import {
  evaluateStellarCheckout,
  verifyStellarSettlement
} from "../lib/stellar-checkout.cjs";
import {
  stellarMainnetLiveCollectionEnabled
} from "../lib/stellar-mainnet.cjs";

assert.equal(
  stellarMainnetLiveCollectionEnabled({
    HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true"
  }),
  false
);

for (const flow of ["marketplace", "services", "events"]) {
  const quote = evaluateStellarCheckout({
    flow,
    price: 25,
    idempotency_key: "guard-" + flow + "-123"
  });
  assert.equal(quote.ok, true, flow);
  assert.equal(quote.paid, false, flow);
}

for (const flow of ["ai", "jobs", "subscription", "recurring"]) {
  const refused = evaluateStellarCheckout({
    flow,
    price: 25,
    idempotency_key: "guard-bad-" + flow
  });
  assert.equal(refused.paid, false, flow);
  assert.ok(
    refused.code === "XLM_RECURRING_UNSUPPORTED" ||
      refused.code === "XLM_FLOW_UNSUPPORTED",
    flow + " " + refused.code
  );
}

const pendingIntent = {
  id: "intent-pending",
  user_id: "user-1",
  status: "unpaid",
  expires_at: new Date(Date.now() + 60000).toISOString(),
  destination: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  memo: "pendingmemo01",
  amount_xlm: "1.0000000",
  settlement_model: "platform_collect",
  tx_hash: null,
  network: "testnet"
};

const pending = await verifyStellarSettlement(
  {
    from() {
      const state = { filters: {} };
      const api = {
        select() {
          return api;
        },
        eq(field, value) {
          state.filters[field] = value;
          return api;
        },
        neq(field, value) {
          state.filters["neq_" + field] = value;
          return api;
        },
        update() {
          return api;
        },
        maybeSingle: async () => {
          if (state.filters.tx_hash) {
            return { data: null };
          }
          if (
            state.filters.id &&
            state.filters.id !== pendingIntent.id
          ) {
            return { data: null };
          }
          return { data: { ...pendingIntent } };
        },
        single: async () => ({ data: null })
      };
      return api;
    }
  },
  "user-1",
  { intent_id: "intent-pending", tx_hash: "d".repeat(64) },
  {
    env: {
      HAVKAR_STELLAR_TESTNET_DESTINATION:
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      HAVKAR_XLM_ALLOW_PLATFORM_COLLECT: "true"
    },
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) })
  }
);

assert.equal(pending.order_paid, false);
assert.equal(pending.settlement, "pending");
assert.equal(pending.code, "TX_NOT_FOUND");

const checkout = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(checkout, /validateXlmQuoteSubject/);
assert.match(checkout, /marketplace_listing_ended/);
assert.match(checkout, /SELF_PURCHASE_FORBIDDEN/);
assert.match(checkout, /HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION/);

const details = fs.readFileSync("ad-details.html", "utf8");
assert.match(details, /payAndVerify/);
assert.doesNotMatch(details, /\bquoted\s*&&/);
assert.match(details, /cannot pay yourself for your own listing/);

const xlm = fs.readFileSync("havkar-xlm-checkout.js", "utf8");
assert.match(xlm, /mainnet_customer_live/);
assert.match(xlm, /describeNetworkAvailability/);
assert.match(xlm, /direct_split/);
assert.doesNotMatch(xlm, /settlement_model: quoteResult\.settlement_model \|\| "platform_collect"/);

const settlementModels = fs.readFileSync("lib/stellar-settlement-models.cjs", "utf8");
assert.match(settlementModels, /HAVKAR_XLM_ALLOW_PLATFORM_COLLECT === "true"/);
assert.match(settlementModels, /disabled_by_default|Disabled by default/);
assert.match(settlementModels, /MODEL_DIRECT_SPLIT/);
assert.match(settlementModels, /buyerPays/);

const walletSource = fs.readFileSync("stellar-wallet-source.js", "utf8");
assert.match(walletSource, /expectedPayments/);
assert.match(walletSource, /operations\.length !== expectedPayments\.length/);

console.log("XLM_FLOW_GUARDS_TEST_OK");
