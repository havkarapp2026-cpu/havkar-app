import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  fetchEurRates,
  quoteWithFees,
  isFxQuoteFresh,
  FX_SOURCE,
  QUOTE_TTL_MS
} = require("../lib/havkar-fx-rates.cjs");

const fx = await fetchEurRates();
assert.equal(fx.ok, true);
assert.equal(fx.base, "EUR");
assert.equal(fx.source, FX_SOURCE);
assert.equal(fx.rates.EUR, 1);
assert.ok(fx.rates.USD > 0);
assert.ok(fx.fetched_at);
assert.ok(fx.expires_at);
assert.equal(isFxQuoteFresh(fx), true);

const usd = quoteWithFees(100, "USD", fx.rates, fx);
assert.equal(usd.ok, true);
assert.equal(usd.fx_source, FX_SOURCE);
assert.equal(usd.settlement_currency, "EUR");
assert.equal(usd.buyer_fee_rate, 0.02);
assert.equal(usd.seller_fee_rate, 0.03);
assert.ok(usd.fx_expires_at);

const missing = quoteWithFees(10, "XXX", fx.rates, fx);
assert.equal(missing.ok, false);
assert.equal(missing.error, "fx_rate_missing");

const expiredMeta = {
  ...fx,
  expires_at: new Date(Date.now() - 5).toISOString()
};
const expired = quoteWithFees(10, "USD", fx.rates, expiredMeta);
assert.equal(expired.ok, false);
assert.equal(expired.error, "fx_quote_expired");
assert.ok(QUOTE_TTL_MS >= 60_000);

console.log("HAVKAR_FX_RATES_TEST_OK", fx.date, "USD=", fx.rates.USD);
