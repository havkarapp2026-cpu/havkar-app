import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const {
  PRESENTMENT_COUNT,
  listStripePresentmentCurrencies
} = require("../lib/stripe-supported-currencies-60.cjs");
const {
  resolvePartnerCurrency,
  OMIO_PUBLIC_CURRENCY_HINTS,
  buildGlobalTravelPartnerLinks
} = require("../lib/omio-adapter.cjs");
const { coverageAgainstPresentment, fetchEurRates, convertMajor } =
  require("../lib/havkar-fx-rates.cjs");

const tickets = fs.readFileSync("tickets.html", "utf8");
const events = fs.readFileSync("events.html", "utf8");
const selectSrc = fs.readFileSync("havkar-currency-select.js", "utf8");
const regionsSrc = fs.readFileSync("havkar-currency-regions.js", "utf8");
const presentmentSrc = fs.readFileSync("havkar-presentment-currencies.js", "utf8");
const report = fs.readFileSync(
  "store/TICKETS_133_CURRENCY_XLM_20261124.md",
  "utf8"
);

assert.equal(PRESENTMENT_COUNT, 133);
assert.equal(listStripePresentmentCurrencies().length, 133);

const sandbox = { console };
sandbox.globalThis = sandbox;
vm.runInNewContext(presentmentSrc + "\n" + regionsSrc + "\n" + selectSrc, sandbox);
assert.equal(sandbox.HAVKAR_PRESENTMENT_CURRENCIES.count, 133);
assert.equal(sandbox.HAVKAR_CURRENCY_REGIONS.count, 133);
assert.ok(!sandbox.HAVKAR_PRESENTMENT_CURRENCIES.codes.includes("xlm"));
assert.match(sandbox.HAVKAR_CURRENCY_REGIONS.regionFor("eur"), /Eurozone/i);
assert.match(sandbox.HAVKAR_CURRENCY_REGIONS.regionFor("xlm"), /crypto/i);
assert.ok(sandbox.HAVKAR_CURRENCY_SELECT);
assert.equal(
  sandbox.HAVKAR_CURRENCY_SELECT.convertFromEur(10, "USD", { USD: 1.1 }).ok,
  true
);
assert.equal(
  sandbox.HAVKAR_CURRENCY_SELECT.convertFromEur(10, "XXX", { USD: 1.1 }).ok,
  false
);
assert.equal(
  sandbox.HAVKAR_CURRENCY_SELECT.convertFromEur(10, "XLM", { USD: 1.1 }).error,
  "xlm_not_fx_fiat"
);

assert.match(tickets, /havkar-presentment-currencies\.js/);
assert.match(tickets, /havkar-currency-regions\.js/);
assert.match(tickets, /ticketsCurrencyMount/);
assert.match(tickets, /133 currencies \+ XLM/);
assert.match(tickets, /Display ≠ partner payment ≠ Stripe settlement/);
assert.match(tickets, /prefer_currency/);
assert.match(tickets, /Payment currency before redirect/);
assert.doesNotMatch(tickets, /event_seats|havkar_claim_event_seat/);

assert.match(events, /eventCurrencyMount/);
assert.match(events, /havkar-currency-regions\.js/);
assert.match(events, /havkar_events_currency_v2/);
assert.match(events, /Card settlement remains EUR/);
assert.match(events, /no valid FX rate — not estimated/);
assert.match(events, /XLM rail separate/);

const eurHint = resolvePartnerCurrency("EUR");
assert.equal(eurHint.passed_to_partner, true);
assert.equal(eurHint.partner_currency, "EUR");
const xlmHint = resolvePartnerCurrency("XLM");
assert.equal(xlmHint.passed_to_partner, false);
assert.equal(xlmHint.partner_currency, "EUR");
assert.equal(xlmHint.reason, "xlm_not_partner_fiat");
const obscure = resolvePartnerCurrency("AFN");
assert.equal(obscure.passed_to_partner, false);
assert.equal(obscure.partner_currency, "EUR");
assert.ok(OMIO_PUBLIC_CURRENCY_HINTS.has("EUR"));
assert.ok(!OMIO_PUBLIC_CURRENCY_HINTS.has("XLM"));

const links = buildGlobalTravelPartnerLinks({
  from: "Rome",
  to: "Milan",
  mode: "train",
  currency: "JPY"
});
assert.equal(links.ok, true);
assert.equal(links.currency.partner, "JPY");
assert.equal(links.currency.passed_to_partner, true);
assert.match(links.links[0].url, /currency=JPY/);

const linksXlm = buildGlobalTravelPartnerLinks({
  from: "Rome",
  to: "Milan",
  currency: "XLM"
});
assert.equal(linksXlm.currency.partner, "EUR");
assert.equal(linksXlm.currency.passed_to_partner, false);

const fx = await fetchEurRates();
const coverage = coverageAgainstPresentment(
  listStripePresentmentCurrencies().map((c) => c.code),
  fx
);
assert.ok(coverage.covered_count >= 100);
assert.equal(convertMajor(10, "EUR", fx.rates).ok, true);
assert.equal(convertMajor(10, "NOTACURRENCY", fx.rates).error, "fx_rate_missing");

assert.match(selectSrc, /Independent crypto rail/);
assert.match(selectSrc, /never invent/);
assert.match(selectSrc, /data-hcs="display"/);
assert.match(report, /✅|🟡|🔴/);
assert.match(report, /133/);
assert.match(report, /284|285/);

console.log("TICKETS_133_CURRENCY_XLM_TEST_OK", {
  presentment: PRESENTMENT_COUNT,
  regions: sandbox.HAVKAR_CURRENCY_REGIONS.count,
  fx_covered: coverage.covered_count,
  omio_hints: OMIO_PUBLIC_CURRENCY_HINTS.size
});
