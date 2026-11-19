import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const presentment = fs.readFileSync("havkar-presentment-currencies.js", "utf8");
const marketSrc = fs.readFileSync("havkar-marketplace.js", "utf8");
const postAd = fs.readFileSync("post-ad.html", "utf8");
const buySell = fs.readFileSync("buy-sell.html", "utf8");
const api = fs.readFileSync("api/create-event-checkout.js", "utf8");

function loadMarketplace() {
  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    URL,
    URLSearchParams
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(presentment + "\n" + marketSrc, sandbox);
  return sandbox.HAVKAR_MARKETPLACE || sandbox.module.exports;
}

test("presentment list is exactly 133 fiat codes and excludes XLM", () => {
  const sandbox = { module: { exports: {} }, exports: {}, console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(presentment, sandbox);
  const bag = sandbox.HAVKAR_PRESENTMENT_CURRENCIES;
  assert.equal(bag.count, 133);
  assert.equal(bag.list.length, 133);
  assert.ok(!bag.codes.includes("xlm"));
  assert.ok(bag.codes.includes("eur"));
  assert.ok(bag.codes.includes("usd"));
  assert.ok(bag.codes.includes("jpy"));
});

test("quoteListingFees applies 2%/3% in listing currency with decimals", () => {
  const market = loadMarketplace();
  const eur = market.quoteListingFees(100, "EUR");
  assert.equal(eur.ok, true);
  assert.equal(eur.buyerFee, 2);
  assert.equal(eur.sellerFee, 3);
  assert.equal(eur.buyerPays, 102);
  assert.equal(eur.sellerReceives, 97);
  const jpy = market.quoteListingFees(1000, "JPY");
  assert.equal(jpy.ok, true);
  assert.equal(jpy.currency, "JPY");
  assert.equal(jpy.decimals, 0);
  assert.equal(jpy.buyerFee, 20);
  assert.equal(jpy.sellerFee, 30);
  const xlm = market.quoteListingFees(10, "XLM");
  assert.equal(xlm.ok, false);
});

test("price filter can compare across currencies with FX rates", () => {
  const market = loadMarketplace();
  const rates = { USD: 1.1, SEK: 11 };
  const rowUsd = { price: 110, currency: "USD", city: "Rome" };
  assert.equal(
    market.listingMatchesPriceAndCity(rowUsd, {
      city: "Rome",
      minPrice: 90,
      maxPrice: 110,
      priceCurrency: "EUR",
      rates
    }),
    true
  );
  assert.equal(
    market.listingMatchesPriceAndCity(rowUsd, {
      currency: "EUR",
      minPrice: 1,
      maxPrice: 100000
    }),
    false
  );
});

test("share URL accepts numeric marketplace listing ids", () => {
  const market = loadMarketplace();
  assert.equal(
    market.listingShareUrl("https://havkar.online", "66"),
    "https://havkar.online/ad-details.html?id=66"
  );
});

test("post-ad never assigns XLM into listing currency hidden field", () => {
  assert.match(postAd, /Listing price stays in/);
  assert.doesNotMatch(
    postAd,
    /sel\.method === 'xlm_mainnet'\)\{\s*hidden\.value = 'XLM'/
  );
});

test("buy-sell exposes currency filters and loads FX from currency-matrix", () => {
  assert.match(buySell, /id="currencyFilter"/);
  assert.match(buySell, /id="priceCurrency"/);
  assert.match(buySell, /ensureFxRates/);
  assert.match(buySell, /havkar-presentment-currencies\.js/);
});

test("currency-matrix GET includes frankfurter FX payload for filters", () => {
  assert.match(api, /fx:\s*\{/);
  assert.match(api, /coverageAgainstPresentment/);
  assert.match(api, /fetchEurRates\(\)/);
});
