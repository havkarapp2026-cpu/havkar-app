import assert from "node:assert/strict";
import {
  CURRENCIES_60,
  PRESENTMENT_COUNT,
  listStripeCurrencies60,
  listStripePresentmentCurrencies,
  isSupportedCheckoutCurrency,
  toMinorUnits,
  applyBuyerSellerFeesMajor
} from "../lib/stripe-supported-currencies-60.cjs";
import {
  describeCurrencyMatrix,
  normalizeStripeFiatCurrency,
  DEFAULT_ALLOWED
} from "../lib/stripe-fiat-currency.cjs";
import { quoteWithFees, isFxQuoteFresh } from "../lib/havkar-fx-rates.cjs";
import fs from "node:fs";

assert.equal(PRESENTMENT_COUNT, 133);
assert.equal(CURRENCIES_60.length, 133);
assert.equal(listStripeCurrencies60().length, 133);
assert.equal(listStripePresentmentCurrencies().length, 133);
assert.equal(DEFAULT_ALLOWED.length, 133);

const codes = new Set(CURRENCIES_60.map((c) => c.code));
assert.equal(codes.size, 133);
assert.equal(isSupportedCheckoutCurrency("eur"), true);
assert.equal(isSupportedCheckoutCurrency("jpy"), true);
assert.equal(isSupportedCheckoutCurrency("xxx"), false);

const jpy = toMinorUnits(50, "jpy");
assert.equal(jpy.ok, true);
assert.equal(jpy.amount_minor, 50);

const usd = toMinorUnits(10.99, "usd");
assert.equal(usd.ok, true);
assert.equal(usd.amount_minor, 1099);

const isk = toMinorUnits(5, "isk");
assert.equal(isk.ok, true);
assert.equal(isk.amount_minor, 500);

const fees = applyBuyerSellerFeesMajor(100);
assert.equal(fees.ok, true);
assert.equal(fees.buyer_pays, 102);
assert.equal(fees.seller_receives, 97);
assert.equal(fees.platform_fee, 5);

const matrix = describeCurrencyMatrix();
assert.equal(matrix.count, 133);
assert.equal(matrix.settlement_currency, "eur");
assert.equal(normalizeStripeFiatCurrency("eur").ok, true);
assert.equal(normalizeStripeFiatCurrency("xxx").ok, false);

const expired = quoteWithFees(10, "USD", { USD: 1.1 }, {
  expires_at: new Date(Date.now() - 1000).toISOString(),
  source: "frankfurter.app"
});
assert.equal(expired.ok, false);
assert.equal(expired.error, "fx_quote_expired");
assert.equal(isFxQuoteFresh({ expires_at: new Date(Date.now() - 1).toISOString() }), false);
assert.equal(isFxQuoteFresh({ expires_at: new Date(Date.now() + 60000).toISOString() }), true);

const presentment = fs.readFileSync("havkar-presentment-currencies.js", "utf8");
assert.match(presentment, /Count[=:]\s*133/);
assert.match(presentment, /usd/);
assert.match(presentment, /eur/);

console.log("CURRENCY_133_MATRIX_TEST_OK");
