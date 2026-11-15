import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PRESENTMENT_COUNT } = require("../lib/stripe-supported-currencies-60.cjs");
const { moduleCatalog } = require("../lib/havkar-global-payments.cjs");
const { hotelsPaymentMethods } = require("../lib/havkar-module-payments.cjs");

assert.equal(PRESENTMENT_COUNT, 133);

const catalog = moduleCatalog();
const hotels = catalog.modules.find((row) => row.id === "hotels");
assert.ok(hotels);
assert.equal(hotels.fiat_currencies, 133);

const methods = hotelsPaymentMethods({
  HAVKAR_HOTELS_LIVE_BOOKING_ENABLED: "false"
});
assert.equal(methods.public_live_booking, false);
assert.equal(methods.xlm_is_not_a_stripe_currency, true);
assert.equal(methods.methods.find((m) => m.id === "xlm_mainnet").charge_allowed_now, false);

const api = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(api, /hotels_payment_methods/);
assert.match(api, /xlm_is_not_a_stripe_currency/);

const page = fs.readFileSync("accommodation.html", "utf8");
assert.match(page, /payXlmCard/);
assert.match(page, /payStripeCard/);
assert.match(page, /quoteXlmBtn/);
assert.match(page, /quoteStripeBtn/);
assert.match(page, /xlm-mark/);
assert.match(page, /hotels_payment_methods/);
assert.match(page, /xlm_mainnet/);
assert.match(page, /display-only/);

const stellar = fs.readFileSync("lib/stellar-checkout.cjs", "utf8");
assert.match(stellar, /rate_as_of/);
assert.match(stellar, /rate_source/);

console.log("HOTELS_XLM_PAYMENT_OPTION_TEST_OK");
