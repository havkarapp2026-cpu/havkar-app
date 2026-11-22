import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  adsPaymentMethods,
  businessPaymentMethods,
  hotelsPaymentMethods,
  aiPaymentMethods
} = require("../lib/havkar-module-payments.cjs");
const {
  describePresentmentCapabilityMatrix
} = require("../lib/stripe-currency-capability-audit.cjs");

const ads = adsPaymentMethods({ HAVKAR_ADS_BOOST_TEST_ENABLED: "false" });
assert.equal(ads.ok, true);
assert.equal(ads.live_flag_armed, false);
assert.equal(ads.boost_list_price_eur, 5);
assert.ok(ads.methods.some((m) => m.id === "xlm_mainnet"));

const business = businessPaymentMethods({
  HAVKAR_BUSINESS_LISTING_PAYMENTS_ENABLED: "false"
});
assert.equal(business.ok, true);
assert.equal(business.live_flag_armed, false);
assert.ok(business.plans.some((p) => p.list_price_eur === 99));

const hotels = hotelsPaymentMethods({
  HAVKAR_HOTELS_LIVE_BOOKING_ENABLED: "false"
});
assert.equal(hotels.ok, true);
assert.equal(hotels.public_live_booking, false);
assert.equal(hotels.HOTELS_LIVE_BOOKING_OFF, true);
assert.equal(hotels.xlm_flow, "services");
assert.ok(hotels.methods.every((m) => m.charge_allowed_now === false));

const ai = aiPaymentMethods({ HAVKAR_REAL_PAYMENTS_ENABLED: "false" });
assert.equal(ai.ok, true);
assert.ok(ai.prepaid_packs.some((p) => p.id === "ai_credits_plus"));

const matrix = describePresentmentCapabilityMatrix(null);
assert.equal(matrix.ok, true);
assert.equal(matrix.registry_count, 133);
assert.equal(matrix.italian_account_expected_country, "IT");
assert.equal(matrix.live_collection, false);
assert.equal(matrix.probe_summary.mode, "account_snapshot_only");

const api = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(api, /jobs_payment_methods/);
assert.match(api, /services_quote/);
assert.match(api, /hotels_payment_methods/);
assert.match(api, /ads_payment_methods/);
assert.match(api, /business_payment_methods/);
assert.match(api, /currency_capability_audit/);
assert.match(api, /ai_entitlement_check/);
assert.match(api, /xlm_is_not_a_stripe_currency/);

const hotelsPage = fs.readFileSync("accommodation.html", "utf8");
assert.match(hotelsPage, /payXlmCard/);
assert.match(hotelsPage, /payStripeCard/);
assert.match(hotelsPage, /Not yet available/);
assert.match(hotelsPage, /Owner authorization/);
assert.doesNotMatch(hotelsPage, /quoteXlmBtn/);
assert.doesNotMatch(hotelsPage, /hotels_payment_methods/);

const checkout = fs.readFileSync("checkout-currency.html", "utf8");
assert.match(checkout, /133-currency checkout matrix/);
assert.doesNotMatch(checkout, /60-currency checkout matrix/);
assert.match(checkout, /viewport-fit=cover/);
assert.match(checkout, /@media\(max-width:560px\)/);

const profile = fs.readFileSync("profile.html", "utf8");
assert.match(profile, /business_listing_annual/);
assert.match(profile, /\/api\/global-payments/);
assert.doesNotMatch(profile, /probeBusinessGlobalPayments/);

const adsPage = fs.readFileSync("ad-view.html", "utf8");
assert.match(adsPage, /ads_payment_methods/);

console.log("HAVKAR_MODULE_PAYMENTS_TEST_OK");
