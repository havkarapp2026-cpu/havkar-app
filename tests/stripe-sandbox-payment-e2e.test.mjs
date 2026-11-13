import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  CONFIRM_PHRASE,
  SCENARIOS,
  parseConfirm,
  parseScenario
} = require("../lib/stripe-sandbox-payment-e2e.cjs");

test("parseConfirm accepts exact staging phrase only", () => {
  assert.equal(parseConfirm({ confirm: CONFIRM_PHRASE }), true);
  assert.equal(parseConfirm({ confirm: "nope" }), false);
});

test("parseScenario defaults to payout_paid and rejects unknown", () => {
  assert.equal(parseScenario({}), SCENARIOS.payout_paid);
  assert.equal(parseScenario({ scenario: "payment_success" }), "payment_success");
  assert.equal(parseScenario({ scenario: "refund" }), "refund");
  assert.equal(parseScenario({ scenario: "payment_fail" }), "payment_fail");
  assert.equal(parseScenario({ scenario: "connect_onboard" }), "connect_onboard");
  assert.equal(parseScenario({ scenario: "live_charge" }), null);
});
