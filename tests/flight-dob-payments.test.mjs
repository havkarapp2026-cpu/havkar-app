import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  composeFlightDob,
  isLeapYear,
  daysInMonth
} = require("../lib/flight-dob.cjs");
const {
  listStripeCurrencies60,
  isSupportedCheckoutCurrency
} = require("../lib/stripe-supported-currencies-60.cjs");
const {
  REAL_PAYMENTS_PAUSED_CODE,
  realPaymentsEnabled
} = require("../lib/real-payments.cjs");

const tickets = fs.readFileSync("tickets.html", "utf8");
const flightOrder = fs.readFileSync("api/flight-order.js", "utf8");

// TASK 1 — DOB dropdowns
assert.match(tickets, /id="paxBornDay"/);
assert.match(tickets, /id="paxBornMonth"/);
assert.match(tickets, /id="paxBornYear"/);
assert.match(tickets, /id="paxBorn"/);
assert.match(tickets, /type="hidden"/);
assert.doesNotMatch(tickets, /id="paxBorn" type="date"/);
assert.match(tickets, /composePassengerDob/);
assert.match(tickets, /daysInMonthDob/);
assert.match(tickets, /isLeapYearDob/);

assert.equal(isLeapYear(2024), true);
assert.equal(isLeapYear(1900), false);
assert.equal(isLeapYear(2000), true);
assert.equal(daysInMonth(2024, 2), 29);
assert.equal(daysInMonth(2023, 2), 28);
assert.equal(composeFlightDob(29, 2, 2024), "2024-02-29");
assert.equal(composeFlightDob(29, 2, 2023), null);
assert.equal(composeFlightDob(31, 4, 2020), null);
assert.equal(composeFlightDob(15, 6, 1990), "1990-06-15");

// TASK 2 — gated global payments
assert.match(tickets, /intent: "payment_options"/);
assert.match(tickets, /intent: "payment_quote"/);
assert.match(tickets, /intent: "live_checkout"/);
assert.match(tickets, /DISABLED until Owner approval|DISABLED until explicit Owner approval/);
assert.match(flightOrder, /intent === "payment_options"/);
assert.match(flightOrder, /intent === "payment_quote"/);
assert.match(flightOrder, /intent === "live_checkout"/);
assert.match(flightOrder, /listStripeCurrencies60/);
assert.match(flightOrder, /xlm_mainnet/);
assert.match(flightOrder, new RegExp(REAL_PAYMENTS_PAUSED_CODE));
assert.match(flightOrder, /public_live_checkout: false/);
assert.match(
  flightOrder,
  /FLIGHT_LIVE_CHECKOUT_BLOCKED_DUFFEL|FLIGHT_LIVE_CHECKOUT_NOT_ARMED|REAL_PAYMENTS_PAUSED/
);
assert.ok(listStripeCurrencies60().length >= 130);
assert.equal(isSupportedCheckoutCurrency("eur"), true);
assert.equal(isSupportedCheckoutCurrency("xxx"), false);
assert.equal(realPaymentsEnabled({ HAVKAR_REAL_PAYMENTS_ENABLED: "false" }), false);

console.log("FLIGHT_DOB_PAYMENTS_TEST_OK");
