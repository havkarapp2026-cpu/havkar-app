import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  isHealthyExternalBankStatus,
  isBlockingExternalBankStatus,
  describeExternalBankPayoutReadiness
} = require("../lib/stripe-bank-status.cjs");

test("status=new is healthy and not a verification blocker", () => {
  assert.equal(isHealthyExternalBankStatus("new"), true);
  assert.equal(isBlockingExternalBankStatus("new"), false);
  const readiness = describeExternalBankPayoutReadiness(
    { status: "new", available_payout_methods: ["standard"] },
    { payouts_enabled: true, charges_enabled: true }
  );
  assert.equal(readiness.eligible_for_scheduled_payouts, true);
  assert.match(readiness.note, /status=new is normal/i);
});

test("errored and verification_failed block payouts", () => {
  assert.equal(isBlockingExternalBankStatus("errored"), true);
  assert.equal(isBlockingExternalBankStatus("verification_failed"), true);
  const readiness = describeExternalBankPayoutReadiness(
    { status: "errored" },
    { payouts_enabled: true, charges_enabled: true }
  );
  assert.equal(readiness.eligible_for_scheduled_payouts, false);
});
