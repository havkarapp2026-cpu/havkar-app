import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const LANGS21 = [
  "en",
  "it",
  "de",
  "fr",
  "es",
  "pt",
  "nl",
  "sv",
  "pl",
  "id",
  "zh",
  "ja",
  "ko",
  "hi",
  "ru",
  "ckb",
  "kmr",
  "tr",
  "ar",
  "fa",
  "ur"
];

function loadBrowserScript(rel) {
  const code = fs.readFileSync(path.join(root, rel), "utf8");
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

test("ui i18n21 covers all selectable languages and keeps Kurdish variants distinct", () => {
  const sandbox = loadBrowserScript("havkar-ui-i18n21.js");
  const api = sandbox.HAVKAR_UI_I18N21;
  assert.ok(api);
  assert.deepEqual(Array.from(api.selectable || []), LANGS21);
  const fa = api.pack("fa");
  const ar = api.pack("ar");
  const ckb = api.pack("ckb");
  const kmr = api.pack("kmr");
  assert.equal(fa["Buy & Sell"], "خرید و فروش");
  assert.equal(ar["Buy & Sell"], "بيع وشراء");
  assert.notEqual(ckb["Buy & Sell"], kmr["Buy & Sell"]);
  assert.equal(ckb["Delivery"], "گەیاندن");
  assert.equal(kmr["Delivery"], "Radestkirin");
  assert.ok(fa["Search this area"]);
  assert.ok(fa["Display currency"]);
  assert.ok(fa["Charge currency"]);
});

test("map helper exposes clustering, bounds, geocode and routing helpers", () => {
  const src = fs.readFileSync(path.join(root, "havkar-map.js"), "utf8");
  assert.match(src, /markerClusterGroup/);
  assert.match(src, /filterItemsInBounds/);
  assert.match(src, /filterByDistanceKm/);
  assert.match(src, /searchThisArea|onBoundsSearch/);
  assert.match(src, /router\.project-osrm\.org/);
  assert.match(src, /hotels_geocode/);
  assert.match(src, /Never fabricates/);
  const sandbox = loadBrowserScript("havkar-map.js");
  const km = sandbox.HAVKAR_MAP.haversineKm(41.9, 12.5, 41.9, 12.5);
  assert.ok(km < 0.001);
});

test("health directory uses 21 language filter and always keeps profile links", () => {
  const health = fs.readFileSync(path.join(root, "health.html"), "utf8");
  for (const code of LANGS21) {
    assert.match(health, new RegExp(`option value="${code}"`));
  }
  assert.match(health, /health-provider\.html\?id=/);
  assert.match(health, /filterItemsInBounds/);
  assert.match(health, /Search this area/);
  assert.match(health, /setMarkers/);
  const cat = fs.readFileSync(path.join(root, "health-category.html"), "utf8");
  assert.match(cat, /health-provider\.html\?id=/);
  assert.match(cat, /filterItemsInBounds/);
  assert.match(cat, /osmDirectionsUrl|openstreetmap\.org\/directions/);
});

test("module map panels exist for buy-sell jobs services delivery", () => {
  for (const file of [
    "buy-sell.html",
    "jobs.html",
    "services.html",
    "delivery.html"
  ]) {
    const src = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(src, /moduleMapPanel/);
    assert.match(src, /havkar-module-map\.js/);
    assert.match(src, /havkar-ui-i18n21\.js/);
  }
});

test("home keeps 15 tiles logo path and AI data-i18n", () => {
  const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const tiles = home.match(/class="menu-item"/g) || [];
  assert.equal(tiles.length, 15);
  assert.match(home, /doctors-pharmacies\.png/);
  assert.match(home, /data-i18n="havkarAi"/);
  assert.match(home, /havkar-ui-i18n21\.js/);
});

test("payment currency rails distinguish presentment charge settlement", () => {
  const {
    buildCurrencyRailsStatus
  } = require("../lib/payment-currency-rails.cjs");
  const status = buildCurrencyRailsStatus({
    HAVKAR_REAL_PAYMENTS_ENABLED: "false",
    HAVKAR_STRIPE_LIVE_ENABLED: "false"
  });
  assert.equal(status.ok, true);
  assert.equal(status.presentment.count, 133);
  assert.equal(status.honesty.xlm_is_not_a_stripe_currency, true);
  assert.equal(status.honesty.live_payments_paused, true);
  assert.equal(status.gates.live_customer_collection, false);
});

test("geocode destination returns structured address fields", async () => {
  const { geocodeDestination } = require("../lib/geocode-destination.cjs");
  const fakeFetch = async () => ({
    ok: true,
    json: async () => [
      {
        lat: "41.9",
        lon: "12.5",
        display_name: "Rome, Lazio, Italy",
        type: "city",
        address: {
          city: "Rome",
          state: "Lazio",
          country_code: "it",
          country: "Italy",
          road: "Via Example",
          postcode: "00100"
        }
      }
    ]
  });
  const geo = await geocodeDestination("Rome", fakeFetch);
  assert.equal(geo.ok, true);
  assert.equal(geo.primary.city, "Rome");
  assert.equal(geo.primary.region, "Lazio");
  assert.equal(geo.primary.address.city, "Rome");
});

test("health live billing and telehealth remain gated in source", () => {
  const api = fs.readFileSync(path.join(root, "lib/havkar-health-api.cjs"), "utf8");
  assert.match(api, /health_live_billing_off|charge_allowed_now/);
  assert.match(api, /telehealth_blocked|BLOCKED/);
});
