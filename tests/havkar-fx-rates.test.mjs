import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  fetchEurRates,
  quoteWithFees,
  isFxQuoteFresh,
  coverageAgainstPresentment,
  FX_SOURCE_PRIMARY,
  FX_SOURCE_SECONDARY,
  QUOTE_TTL_MS
} = require("../lib/havkar-fx-rates.cjs");
const {
  listStripePresentmentCurrencies
} = require("../lib/stripe-supported-currencies-60.cjs");

const fx = await fetchEurRates();
assert.equal(fx.ok, true);
assert.equal(fx.base, "EUR");
assert.ok(String(fx.source).includes(FX_SOURCE_PRIMARY));
assert.equal(fx.rates.EUR, 1);
assert.ok(fx.rates.USD > 0);
assert.ok(fx.fetched_at);
assert.ok(fx.expires_at);
assert.equal(isFxQuoteFresh(fx), true);
assert.ok(fx.sources && fx.sources.primary);
assert.ok(fx.sources.primary.rate_count >= 20);

const codes = listStripePresentmentCurrencies().map((row) => row.code);
const coverage = coverageAgainstPresentment(codes, fx);
assert.equal(coverage.presentment_count, 133);
assert.ok(
  coverage.covered_count >= 100,
  "expected secondary FX fill to cover most presentment codes, got " +
    coverage.covered_count
);
assert.ok(coverage.missing_count < 40);

const usd = quoteWithFees(100, "USD", fx.rates, fx);
assert.equal(usd.ok, true);
assert.ok(usd.fx_source);
assert.equal(usd.settlement_currency, "EUR");

const aed = quoteWithFees(10, "AED", fx.rates, fx);
if (fx.rates.AED) {
  assert.equal(aed.ok, true);
  assert.ok(
    aed.fx_source === FX_SOURCE_PRIMARY ||
      aed.fx_source === FX_SOURCE_SECONDARY
  );
}

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

console.log(
  "HAVKAR_FX_RATES_TEST_OK",
  fx.date,
  "covered=",
  coverage.covered_count,
  "missing=",
  coverage.missing_count,
  "USD=",
  fx.rates.USD
);
