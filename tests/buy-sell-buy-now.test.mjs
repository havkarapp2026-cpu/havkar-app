import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PRESENTMENT_COUNT, listStripePresentmentCurrencies } = require(
  "../lib/stripe-supported-currencies-60.cjs"
);
const market = require("../lib/havkar-marketplace-api.cjs");

assert.equal(PRESENTMENT_COUNT, 133);
assert.equal(listStripePresentmentCurrencies().length, 133);

const currenciesJs = fs.readFileSync("havkar-presentment-currencies.js", "utf8");
assert.match(currenciesJs, /count:CURRENCIES\.length/);
assert.match(currenciesJs, /"code":"eur"/);

const adDetails = fs.readFileSync("ad-details.html", "utf8");
assert.match(adDetails, /id="buyNowButton"/);
assert.match(adDetails, /id="checkoutPanel"/);
assert.match(adDetails, /id="checkoutCurrency"/);
assert.match(adDetails, /Stellar XLM Mainnet/);
assert.match(adDetails, /methodStripeBtn/);
assert.match(adDetails, /havkar-presentment-currencies\.js/);
assert.doesNotMatch(adDetails, /XLM Testnet quote/);
assert.match(adDetails, /\/api\/marketplace/);

const product = fs.readFileSync("product.html", "utf8");
assert.match(product, /Buy Now/);
assert.match(product, /productCheckoutCurrency/);
assert.match(product, /Stellar XLM Mainnet/);
assert.doesNotMatch(product, /XLM Testnet/);

const api = fs.readFileSync("lib/havkar-marketplace-api.cjs", "utf8");
assert.doesNotMatch(api, /\.slice\(0,\s*20\)/);

assert.equal(market.PRESENTMENT_COUNT, 133);

console.log("BUY_SELL_BUY_NOW_TEST_OK");
