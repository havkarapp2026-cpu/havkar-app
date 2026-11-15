import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  PRESENTMENT_COUNT,
  listStripePresentmentCurrencies
} = require("../lib/stripe-supported-currencies-60.cjs");

assert.equal(PRESENTMENT_COUNT, 133);
assert.equal(listStripePresentmentCurrencies().length, 133);

const currencySelect = fs.readFileSync("havkar-currency-select.js", "utf8");
assert.match(currencySelect, /View all 133 currencies/);
assert.match(currencySelect, /xlm_mainnet/);
assert.match(currencySelect, /FEATURED/);
assert.match(currencySelect, /NOT a 134th Stripe presentment currency/);

const presentment = fs.readFileSync("havkar-presentment-currencies.js", "utf8");
assert.match(presentment, /Count=133/);
assert.doesNotMatch(presentment, /"code":"xlm"/);

const mapHelper = fs.readFileSync("havkar-map.js", "utf8");
assert.match(mapHelper, /openstreetmap/i);
assert.match(mapHelper, /googleMapsStatus/);
assert.match(mapHelper, /requestGps/);

const hotels = fs.readFileSync("accommodation.html", "utf8");
assert.match(hotels, /leaflet/i);
assert.match(hotels, /useGpsBtn/);
assert.match(hotels, /havkar-currency-select/);
assert.match(hotels, /Map stays available even when no verified stay is published/);
assert.match(hotels, /\/api\/hotels/);
assert.match(hotels, /havkar_hotel_favorites_v1/);
assert.match(hotels, /compareTray|Compare stays/);
assert.match(hotels, /havkar-premium-i18n/);

const premiumI18n = fs.readFileSync("havkar-premium-i18n.js", "utf8");
for (const code of ["it", "sv", "fa", "ar", "ckb", "kmr"]) {
  assert.match(premiumI18n, new RegExp("\\b" + code + "\\s*:"));
}
assert.match(premiumI18n, /Transport & Logistics/);
assert.match(premiumI18n, /My Reviews/);

const vercel = fs.readFileSync("vercel.json", "utf8");
assert.match(vercel, /\/api\/hotels/);
assert.match(vercel, /havkarAction=hotels/);

const api = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(api, /function isHotelsRequest/);
assert.match(api, /hotels_geocode/);
assert.match(api, /hotels_search/);

const transport = fs.readFileSync("transport.html", "utf8");
assert.match(transport, /Truck/);
assert.match(transport, /delivery\.html/);
assert.match(transport, /taxi\.html/);
assert.match(transport, /does not invent/);
assert.match(transport, /havkar-premium-i18n/);

const delivery = fs.readFileSync("delivery.html", "utf8");
assert.match(delivery, /transport\.html/);
assert.match(delivery, /Request Delivery/);

const ads = fs.readFileSync("ads.html", "utf8");
assert.match(ads, /showMyCampaigns/);
assert.match(ads, /showingMineOnly/);
assert.match(ads, /listing_surface/);
assert.doesNotMatch(fs.readFileSync("index.html", "utf8"), /havkar-ads\.js/);
assert.doesNotMatch(fs.readFileSync("buy-sell.html", "utf8"), /sponsoredBanner|havkar-ads\.js/);

const reviews = fs.readFileSync("reviews.html", "utf8");
assert.match(reviews, /My Reviews/);
assert.match(reviews, /Verified reviews/);
assert.match(reviews, /mine=1|data-filter="mine"/);

const profile = fs.readFileSync("profile.html", "utf8");
assert.match(profile, /My Reviews/);
assert.match(profile, /Customer Reviews/);
assert.match(profile, /reviews\.html\?mine=1/);

const events = fs.readFileSync("events.html", "utf8");
assert.match(events, /event_tickets|QR|check.?in/i);
assert.match(events, /eventsMap|Map discovery/);
assert.match(events, /havkar-map\.js/);
assert.match(events, /locationFilter/);
assert.match(events, /data-event-location/);
assert.match(events, /133 Stripe presentment|checkout-currency\.html/);

const checkout = fs.readFileSync("checkout-currency.html", "utf8");
assert.match(checkout, /havkar-currency-select/);
assert.match(checkout, /133-currency/);

console.log("GLOBAL_PREMIUM_PLATFORM_TEST_OK");
