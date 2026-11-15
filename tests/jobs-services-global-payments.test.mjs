import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  PRESENTMENT_COUNT
} = require("../lib/stripe-supported-currencies-60.cjs");
const {
  moduleCatalog,
  JOB_LISTING_PLANS,
  JOB_CORPORATE_SUBSCRIPTIONS,
  AI_CREDIT_PACKS,
  BUSINESS_LISTING_PLANS
} = require("../lib/havkar-global-payments.cjs");
const {
  jobsPaymentMethods,
  servicesPaymentMethods
} = require("../lib/jobs-services-payments.cjs");
const jobBilling = require("../havkar-job-billing.js");
const serviceCommerce = require("../havkar-service-commerce.js");
const {
  providerCapabilityMatrix,
  refuseUnauthorizedFulfillment,
  validateIdempotencyKey
} = require("../lib/havkar-payment-orchestration.cjs");

assert.equal(PRESENTMENT_COUNT, 133);

const catalog = moduleCatalog();
const jobsMod = catalog.modules.find((m) => m.id === "jobs");
const servicesMod = catalog.modules.find((m) => m.id === "services");
const aiMod = catalog.modules.find((m) => m.id === "ai");
assert.ok(jobsMod);
assert.ok(servicesMod);
assert.ok(aiMod);
assert.equal(jobsMod.fiat_currencies, 133);
assert.equal(servicesMod.fiat_currencies, 133);
assert.equal(servicesMod.commission_bps, 1000);
assert.ok(JOB_LISTING_PLANS.some((p) => p.list_price_eur === 19.99));
assert.ok(
  JOB_CORPORATE_SUBSCRIPTIONS.some(
    (p) => p.id === "business" && p.list_price_eur === 49.99
  )
);
assert.ok(
  JOB_CORPORATE_SUBSCRIPTIONS.some(
    (p) => p.id === "business_plus" && p.list_price_eur === 99.99
  )
);
assert.ok(
  JOB_CORPORATE_SUBSCRIPTIONS.some(
    (p) => p.id === "enterprise" && p.list_price_eur === 199.99
  )
);
assert.ok(AI_CREDIT_PACKS.some((p) => p.id === "ai_credits_plus" && p.list_price_eur === 7.99));
assert.ok(AI_CREDIT_PACKS.some((p) => p.id === "ai_credits_pro" && p.list_price_eur === 14.99));
assert.ok(
  AI_CREDIT_PACKS.some((p) => p.id === "ai_credits_business" && p.list_price_eur === 29.99)
);
assert.ok(BUSINESS_LISTING_PLANS.some((p) => p.list_price_eur === 99));

assert.equal(jobBilling.COMPANY_PLANS.business.eur, 49.99);
assert.equal(jobBilling.COMPANY_PLANS.business_plus.eur, 99.99);
assert.equal(jobBilling.COMPANY_PLANS.enterprise.eur, 199.99);
assert.equal(jobBilling.ORDINARY_PLANS.Professional.eur, 19.99);
assert.equal(jobBilling.ORDINARY_PLANS.Professional.durationDays, 30);
assert.equal(serviceCommerce.APPROVED_COMMISSION_BPS, 1000);

const jobsMethods = jobsPaymentMethods({
  HAVKAR_REAL_PAYMENTS_ENABLED: "false",
  HAVKAR_JOB_PAYMENTS_ENABLED: "false"
});
assert.equal(jobsMethods.live_flag_armed, false);
assert.ok(Array.isArray(jobsMethods.methods));
assert.ok(jobsMethods.methods.some((m) => m.id === "stripe"));
assert.ok(jobsMethods.methods.some((m) => m.id === "xlm_mainnet"));

const servicesMethods = servicesPaymentMethods({
  HAVKAR_REAL_PAYMENTS_ENABLED: "false",
  HAVKAR_SERVICE_PAYMENTS_ENABLED: "false"
});
assert.equal(servicesMethods.commission_bps, 1000);
assert.equal(servicesMethods.customer_extra_havkar_commission, false);
assert.equal(servicesMethods.live_flag_armed, false);

const matrix = providerCapabilityMatrix();
assert.equal(matrix.stripe_presentment.count, 133);
assert.equal(matrix.stellar_xlm.automatic_recurring, false);
assert.equal(matrix.revolut_business.public_iban_exposure, false);
assert.equal(matrix.stripe_presentment.xlm_settlement, false);

assert.equal(validateIdempotencyKey("short").ok, false);
assert.equal(validateIdempotencyKey("idem-key-12345678").ok, true);
assert.equal(refuseUnauthorizedFulfillment().fulfilled, false);

const api = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(api, /isGlobalPaymentsRequest/);
assert.match(api, /global_payments_catalog/);
assert.match(api, /refuseLiveCheckout/);

const vercel = fs.readFileSync("vercel.json", "utf8");
assert.match(vercel, /\/api\/global-payments/);

console.log("JOBS_SERVICES_GLOBAL_PAYMENTS_TEST_OK");
