import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  PRESENTMENT_COUNT,
  getCurrencyMeta,
  toMinorUnits,
  isSupportedCheckoutCurrency
} = require("../lib/stripe-supported-currencies-60.cjs");
const { geocodeDestination } = require("../lib/geocode-destination.cjs");
const {
  buildCurrencyAudit,
  summarizeAccountCapabilities
} = require("../lib/stripe-currency-capability-audit.cjs");

assert.ok(PRESENTMENT_COUNT >= 130);
assert.equal(PRESENTMENT_COUNT, 133);
assert.ok(getCurrencyMeta("eur"));
assert.ok(getCurrencyMeta("xpf"));
assert.equal(getCurrencyMeta("bhd"), null);
assert.equal(getCurrencyMeta("bgn"), null);
assert.equal(getCurrencyMeta("ghs"), null);
assert.equal(isSupportedCheckoutCurrency("xxx"), false);
assert.equal(toMinorUnits(1, "eur").ok, true);

const geo = await geocodeDestination("Milan Italy");
assert.equal(geo.ok, true);
assert.ok(Number.isFinite(geo.primary.latitude));
assert.ok(Number.isFinite(geo.primary.longitude));

const summary = summarizeAccountCapabilities({
  id: "acct_test",
  country: "IT",
  default_currency: "eur",
  charges_enabled: true,
  payouts_enabled: true,
  capabilities: { card_payments: "active", transfers: "active" },
  external_accounts: { data: [{ bank_name: "REVOLUT", currency: "eur", last4: "8455" }] }
});
assert.equal(summary.ok, true);
assert.equal(summary.country, "IT");

const audit = buildCurrencyAudit(
  {
    id: "acct_test",
    country: "IT",
    default_currency: "eur",
    charges_enabled: true,
    payouts_enabled: true,
    capabilities: { card_payments: "active" },
    external_accounts: { data: [] }
  },
  [
    { code: "eur", ok: true },
    { code: "usd", ok: true },
    { code: "xxx", ok: false, error: "invalid" }
  ]
);
assert.equal(audit.registry_count, PRESENTMENT_COUNT);
assert.equal(audit.probe_summary.accepted, 2);

const page = fs.readFileSync("accommodation.html", "utf8");
assert.match(page, /leaflet/i);
assert.match(page, /hotels_geocode/);
assert.doesNotMatch(page, /id="latInput"/);
assert.doesNotMatch(page, /id="lngInput"/);
assert.match(page, /hotels_payment_probe/);

const i18n = fs.readFileSync("havkar-accommodation-i18n.js", "utf8");
assert.match(i18n, /Search stays/);
assert.match(i18n, /Cerca soggiorni/);
assert.match(i18n, /City \/ destination/);

const api = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(api, /hotels_geocode/);
assert.match(api, /hotels_stripe_currency_audit/);
assert.match(api, /hotels_owner_rooms/);
assert.match(api, /hotels_payment_probe/);

const manage = fs.readFileSync("accommodation-manage.html", "utf8");
assert.match(manage, /saveRoom|Room name/);

const roomsMigration = fs.readFileSync(
  "supabase/migrations/20261113180000_accommodation_rooms_inventory.sql",
  "utf8"
);
assert.match(roomsMigration, /accommodation_rooms/);

const langs = fs.readFileSync("havkar-i18n.js", "utf8");
for (const code of ["en", "it", "de", "fr", "es", "pt", "fa", "ar", "tr"]) {
  assert.match(langs, new RegExp('code: "' + code + '"'));
}

console.log("HOTELS_CORRECTIONS_TEST_OK");
