import assert from "node:assert/strict";
import {
  CURRENCIES_60,
  listStripeCurrencies60,
  isSupportedCheckoutCurrency,
  toMinorUnits,
  applyBuyerSellerFeesMajor
} from "../lib/stripe-supported-currencies-60.cjs";
import {
  describeCurrencyMatrix,
  normalizeStripeFiatCurrency,
  DEFAULT_ALLOWED
} from "../lib/stripe-fiat-currency.cjs";
import { quoteWithFees } from "../lib/havkar-fx-rates.cjs";
import fs from "node:fs";

assert.equal(CURRENCIES_60.length, 60);
assert.equal(listStripeCurrencies60().length, 60);
assert.equal(DEFAULT_ALLOWED.length, 60);

const codes = new Set(CURRENCIES_60.map((c) => c.code));
assert.equal(codes.size, 60);
assert.equal(isSupportedCheckoutCurrency("eur"), true);
assert.equal(isSupportedCheckoutCurrency("jpy"), true);
assert.equal(isSupportedCheckoutCurrency("xxx"), false);

const jpy = toMinorUnits(50, "jpy");
assert.equal(jpy.ok, true);
assert.equal(jpy.amount_minor, 50);

const usd = toMinorUnits(10.99, "usd");
assert.equal(usd.ok, true);
assert.equal(usd.amount_minor, 1099);

const fees = applyBuyerSellerFeesMajor(100);
assert.equal(fees.ok, true);
assert.equal(fees.buyer_pays, 102);
assert.equal(fees.seller_receives, 97);
assert.equal(fees.platform_fee, 5);

const matrix = describeCurrencyMatrix();
assert.equal(matrix.count, 60);
assert.equal(matrix.currencies.length, 60);

const bad = normalizeStripeFiatCurrency("zzz");
assert.equal(bad.ok, false);

const quote = quoteWithFees(100, "USD", { EUR: 1, USD: 1.1 });
assert.equal(quote.ok, true);
assert.equal(quote.currency, "USD");
assert.equal(quote.live_collection, false);
assert.equal(quote.buyer_fee_rate, 0.02);
assert.equal(quote.seller_fee_rate, 0.03);

const api = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(api, /isCurrencyMatrixRequest/);
assert.match(api, /currency_quote/);
assert.match(api, /marketplace_buy_checkout/);
assert.match(api, /LIVE_COLLECTION_PAUSED/);

const vercel = fs.readFileSync("vercel.json", "utf8");
assert.match(vercel, /currency-matrix/);
assert.match(vercel, /chat\|product\|checkout-currency/);

const page = fs.readFileSync("checkout-currency.html", "utf8");
assert.match(page, /currency-matrix/);
assert.match(page, /live payments gated OFF/i);

const adDetails = fs.readFileSync("ad-details.html", "utf8");
assert.match(adDetails, /buyNowPanel/);
assert.match(adDetails, /buyCurrencyList/);
assert.match(adDetails, /marketplace_buy_checkout/);
assert.match(adDetails, /Pay with XLM wallet/);
assert.doesNotMatch(adDetails, /xlmQuoteButton/);
assert.doesNotMatch(
  adDetails,
  /gallery[\s\S]{0,400}Pay with XLM \(Stellar/
);

const chat = fs.readFileSync("chat.html", "utf8");
assert.match(chat, /HAVKAR_CHAT_BUILD/);
assert.match(chat, /loadEmojiCatalogDeferred/);
assert.match(chat, /havkar_send_chat_message/);

console.log("CURRENCY60_MATRIX_TEST_OK");
