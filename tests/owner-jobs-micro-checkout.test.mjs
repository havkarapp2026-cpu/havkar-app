/**
 * Owner-only Jobs €1.00 micro Checkout: public tariffs unchanged,
 * activation still allowed for the micro amount when flagged.
 */
import assert from "node:assert/strict";
import {
  CONFIRM_PHRASE,
  AMOUNT_CENTS,
  AMOUNT_EUR,
  QUOTE_TTL_MS,
  isOwnerIdentity,
  isOwnerJobsMicroMetadata,
  ownerJobsMicroAmountOk
} from "../lib/owner-jobs-micro-checkout.cjs";
import billing from "../havkar-job-billing.js";

assert.equal(AMOUNT_CENTS, 100);
assert.equal(AMOUNT_EUR, 1);
assert.equal(CONFIRM_PHRASE, "PREPARE_JOBS_EUR_1_00_LIVE_CHECKOUT");
assert.ok(QUOTE_TTL_MS >= 30 * 60 * 1000);
assert.equal(billing.ORDINARY_PLANS.Basic.cents, 999);
assert.equal(billing.ORDINARY_PLANS.Basic.eur, 9.99);

assert.equal(
  isOwnerIdentity({
    id: "9b34b0bb-271a-49ee-aeb7-a9d28be06a06",
    email: "other@example.com"
  }),
  true
);
assert.equal(
  isOwnerIdentity({ id: "not-owner", email: "user@example.com" }),
  false
);

assert.equal(
  isOwnerJobsMicroMetadata({ havkar_owner_jobs_micro_test: "true" }),
  true
);
assert.equal(isOwnerJobsMicroMetadata({}), false);
assert.equal(ownerJobsMicroAmountOk(100, "eur"), true);
assert.equal(ownerJobsMicroAmountOk(999, "eur"), false);

const publicReject = billing.decideCheckoutSession({
  mode: "payment",
  payment_status: "paid",
  amount_total: 100,
  currency: "eur",
  metadata: {
    havkar_purpose: "job_advertisement",
    plan: "Basic",
    job_id: "11",
    user_id: "u1"
  }
});
assert.equal(publicReject.reason, "amount_mismatch");

const ownerMicroOk = billing.decideCheckoutSession({
  mode: "payment",
  payment_status: "paid",
  amount_total: 100,
  currency: "eur",
  metadata: {
    havkar_purpose: "job_advertisement",
    havkar_owner_jobs_micro_test: "true",
    paid_by_owner_user_id: "9b34b0bb-271a-49ee-aeb7-a9d28be06a06",
    plan: "Basic",
    job_id: "11",
    user_id: "u1"
  }
});
assert.equal(ownerMicroOk.ok, true);
assert.equal(ownerMicroOk.action, "activate_ordinary_job");
assert.equal(ownerMicroOk.amountCents, 100);
assert.equal(ownerMicroOk.ownerMicro, true);

const ownerMicroWrongAmount = billing.decideCheckoutSession({
  mode: "payment",
  payment_status: "paid",
  amount_total: 200,
  currency: "eur",
  metadata: {
    havkar_purpose: "job_advertisement",
    havkar_owner_jobs_micro_test: "true",
    paid_by_owner_user_id: "9b34b0bb-271a-49ee-aeb7-a9d28be06a06",
    plan: "Basic",
    job_id: "11",
    user_id: "u1"
  }
});
assert.equal(ownerMicroWrongAmount.reason, "amount_mismatch");

const stillPublicBasic = billing.decideCheckoutSession({
  mode: "payment",
  payment_status: "paid",
  amount_total: 999,
  currency: "eur",
  metadata: {
    havkar_purpose: "job_advertisement",
    plan: "Basic",
    job_id: "11",
    user_id: "u1"
  }
});
assert.equal(stillPublicBasic.ok, true);
assert.equal(stillPublicBasic.amountCents, 999);

console.log("OWNER_JOBS_MICRO_CHECKOUT_TEST_OK");
