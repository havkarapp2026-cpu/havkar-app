import assert from "node:assert/strict";
import billing from "../havkar-job-billing.js";

const decide = billing.decideCheckoutSession;

assert.equal(
  decide({
    mode: "payment",
    payment_status: "unpaid",
    amount_total: 999,
    currency: "eur",
    metadata: { havkar_purpose: "job_advertisement", plan: "Basic", job_id: "1", user_id: "u1" }
  }).reason,
  "not_paid"
);

assert.equal(
  decide({
    mode: "payment",
    payment_status: "paid",
    amount_total: 1,
    currency: "eur",
    metadata: { havkar_purpose: "job_advertisement", plan: "Basic", job_id: "1", user_id: "u1" }
  }).reason,
  "amount_mismatch"
);

assert.equal(
  decide({
    mode: "payment",
    payment_status: "paid",
    amount_total: 999,
    currency: "eur",
    metadata: { havkar_purpose: "job_advertisement", plan: "Basic", job_id: "1", user_id: "u1" }
  }).action,
  "activate_ordinary_job"
);

assert.equal(
  decide({
    mode: "payment",
    payment_status: "paid",
    amount_total: 1999,
    currency: "eur",
    metadata: { havkar_purpose: "job_advertisement", plan: "Professional", job_id: "2", user_id: "u1" }
  }).ok,
  true
);

assert.equal(billing.ORDINARY_PLANS.Basic.cents, 999);
assert.equal(billing.ORDINARY_PLANS.Professional.cents, 1999);
assert.equal(billing.ORDINARY_PLANS.Business.cents, 3999);

console.log("JOBS_PAYMENT_ACTIVATION_GATES_TEST_OK");
