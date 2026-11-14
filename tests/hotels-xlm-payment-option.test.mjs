import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PRESENTMENT_COUNT } = require("../lib/stripe-supported-currencies-60.cjs");
const { moduleCatalog } = require("../lib/havkar-global-payments.cjs");

assert.equal(PRESENTMENT_COUNT, 133);
assert.equal(isNaN(PRESENTMENT_COUNT), false);

const catalog = moduleCatalog();
const hotels = catalog.modules.find((row) => row.id === "hotels");
assert.ok(hotels);
assert.equal(hotels.fiat_currencies, 133);
assert.equal(hotels.xlm_flow, "services");

const api = fs.readFileSync("api/create-event-checkout.js", "utf8") + "\n" + fs.readFileSync("lib/havkar-hotels-api.cjs", "utf8");
assert.match(api, /xlm_is_not_a_stripe_currency/);
assert.match(api, /Stellar XLM — Pay with XLM wallet/);
assert.match(api, /availability_status: "not_yet_available"/);
assert.match(api, /buildXlmQuote/);
assert.match(api, /xlm_display/);
assert.match(api, /display_only: true/);
assert.match(api, /charge_allowed_now: false/);
assert.match(api, /HOTELS_LIVE_BOOKING_OFF|public_live_booking: false/);
assert.match(api, /req\.body\.method \|\| req\.body\.payment_method/);

const page = fs.readFileSync("accommodation.html", "utf8");
assert.match(page, /payXlmCard/);
assert.match(page, /payStripeCard/);
assert.match(page, /quoteXlmBtn/);
assert.match(page, /quoteStripeBtn/);
assert.match(page, /xlm-mark/);
assert.match(page, /hotels_payment_methods/);
assert.match(page, /xlm_mainnet/);
assert.match(page, /xlm_display/);
assert.match(page, /display-only \(no charge\)/);
assert.doesNotMatch(page, /id="quoteBtn"/);

const i18n = fs.readFileSync("havkar-accommodation-i18n.js", "utf8");
assert.match(i18n, /Metodi di pagamento/);
assert.match(i18n, /Non ancora disponibile/);
assert.match(i18n, /Paga con wallet XLM/);

const manage = fs.readFileSync("accommodation-manage.html", "utf8");
assert.match(manage, /Owner payout rails/);
assert.match(manage, /Stellar XLM/);

const stellar = fs.readFileSync("lib/stellar-checkout.cjs", "utf8");
assert.match(stellar, /rate_as_of/);
assert.match(stellar, /rate_source/);

console.log("HOTELS_XLM_PAYMENT_OPTION_TEST_OK");
