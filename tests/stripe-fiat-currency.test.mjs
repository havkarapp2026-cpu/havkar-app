import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  allowedStripeFiatCurrencies,
  normalizeStripeFiatCurrency
} = require("../lib/stripe-fiat-currency.cjs");
const { cardPaymentsAllowed, realPaymentsEnabled } = require("../lib/real-payments.cjs");

test("default Stripe fiat allow-list is EUR and USD", () => {
  assert.deepEqual(allowedStripeFiatCurrencies({}), ["eur", "usd"]);
  assert.equal(normalizeStripeFiatCurrency("EUR").ok, true);
  assert.equal(normalizeStripeFiatCurrency("usd").currency, "usd");
  assert.equal(normalizeStripeFiatCurrency("gbp").ok, false);
});

test("live card collection stays paused without exact owner flags", () => {
  assert.equal(realPaymentsEnabled({}), false);
  assert.equal(cardPaymentsAllowed({ STRIPE_SECRET_KEY: "sk_test_x" }), false);
  assert.equal(
    cardPaymentsAllowed({
      HAVKAR_REAL_PAYMENTS_ENABLED: "true",
      STRIPE_SECRET_KEY: "sk_live_x"
    }),
    false
  );
  assert.equal(
    cardPaymentsAllowed({
      HAVKAR_REAL_PAYMENTS_ENABLED: "true",
      HAVKAR_STRIPE_LIVE_ENABLED: "true",
      STRIPE_SECRET_KEY: "sk_live_x"
    }),
    true
  );
});
