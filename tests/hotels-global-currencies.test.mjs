import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  PRESENTMENT_COUNT,
  listStripePresentmentCurrencies,
  searchCurrencies,
  isSupportedCheckoutCurrency
} = require("../lib/stripe-supported-currencies-60.cjs");
const { classifyStaysAccess, searchDuffelStays } = require("../lib/duffel-stays.cjs");
const { moduleCatalog, buildGlobalPaymentQuote } = require("../lib/havkar-global-payments.cjs");

assert.ok(PRESENTMENT_COUNT >= 130);
assert.equal(listStripePresentmentCurrencies().length, PRESENTMENT_COUNT);
assert.ok(searchCurrencies("yen").some((row) => row.code === "jpy"));
assert.equal(isSupportedCheckoutCurrency("xpf"), true);
assert.equal(isSupportedCheckoutCurrency("xxx"), false);

const denied = classifyStaysAccess({ token_mode: "test", http_status: 403 });
assert.equal(denied.access, "denied");
assert.equal(denied.stays_ready, false);

const catalog = moduleCatalog();
const hotels = catalog.modules.find((row) => row.id === "hotels");
assert.ok(hotels);
assert.equal(hotels.fiat_currencies, PRESENTMENT_COUNT);
assert.equal(catalog.stripe.fixed_60_limit_removed, true);

const quote = await buildGlobalPaymentQuote({
  module: "hotels",
  method: "stripe",
  currency: "usd",
  list_price_eur: 100
});
assert.equal(quote.ok, true);
assert.equal(quote.method, "stripe");
assert.ok(quote.quote && quote.quote.ok === true);

const missingSearch = await searchDuffelStays(
  { check_in: "", check_out: "" },
  { DUFFEL_ACCESS_TOKEN: "" }
);
assert.equal(missingSearch.ok, false);

const api = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(api, /isHotelsRequest/);
assert.match(api, /hotels_search/);
assert.match(api, /hotels_quote/);
assert.match(api, /hotels_book/);
assert.match(api, /hotels_history/);
assert.match(api, /hotels_owner_status/);
assert.match(api, /probeDuffelStaysAccess/);
assert.match(api, /searchDuffelStays/);
assert.match(api, /HOTELS_LIVE_BOOKING_OFF/);
assert.match(api, /XLM_DUFFEL_STAYS_BLOCKED/);

const vercel = fs.readFileSync("vercel.json", "utf8");
assert.match(vercel, /\/api\/hotels/);

const page = fs.readFileSync("accommodation.html", "utf8");
assert.match(page, /Search stays/);
assert.match(page, /\/api\/hotels/);
assert.match(page, /currencySelect/);
assert.match(page, /childrenInput/);
assert.match(page, /hotels_quote/);
assert.match(page, /hotels_history/);
assert.doesNotMatch(page, /sample hotel/i);

const migration = fs.readFileSync(
  "supabase/migrations/20261113170000_accommodation_guest_bookings.sql",
  "utf8"
);
assert.match(migration, /accommodation_guest_bookings/);
assert.match(migration, /payouts|ROW LEVEL SECURITY/i);

console.log("HOTELS_GLOBAL_CURRENCIES_TEST_OK");
