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
  JOB_CORPORATE_SUBSCRIPTIONS
} = require("../lib/havkar-global-payments.cjs");
const {
  jobsPaymentMethods,
  servicesPaymentMethods
} = require("../lib/jobs-services-payments.cjs");
const jobBilling = require("../havkar-job-billing.js");
const serviceCommerce = require("../havkar-service-commerce.js");

assert.equal(PRESENTMENT_COUNT, 133);

const catalog = moduleCatalog();
const jobsMod = catalog.modules.find((m) => m.id === "jobs");
const servicesMod = catalog.modules.find((m) => m.id === "services");
assert.ok(jobsMod);
assert.ok(servicesMod);
assert.equal(jobsMod.fiat_currencies, 133);
assert.equal(servicesMod.fiat_currencies, 133);
assert.equal(servicesMod.commission_bps, 1000);
assert.ok(JOB_LISTING_PLANS.some((p) => p.list_price_eur === 19.99));
assert.ok(JOB_CORPORATE_SUBSCRIPTIONS.some((p) => p.id === "business" && p.list_price_eur === 49.99));
assert.ok(JOB_CORPORATE_SUBSCRIPTIONS.some((p) => p.id === "business_plus" && p.list_price_eur === 99.99));
assert.ok(JOB_CORPORATE_SUBSCRIPTIONS.some((p) => p.id === "enterprise" && p.list_price_eur === 199.99));

assert.equal(jobBilling.COMPANY_PLANS.business.eur, 49.99);
assert.equal(jobBilling.COMPANY_PLANS.business_plus.eur, 99.99);
assert.equal(jobBilling.COMPANY_PLANS.enterprise.eur, 199.99);
assert.equal(jobBilling.ORDINARY_PLANS.Professional.eur, 19.99);
assert.equal(jobBilling.ORDINARY_PLANS.Professional.durationDays, 30);

const commission = serviceCommerce.commissionPolicy({});
assert.equal(commission.ok, true);
assert.equal(commission.bps, 1000);
assert.equal(commission.payer, "provider");

const jobsMethods = jobsPaymentMethods({
  HAVKAR_REAL_PAYMENTS_ENABLED: "false",
  HAVKAR_JOB_PAYMENTS_ENABLED: "false"
});
assert.equal(jobsMethods.stripe_presentment_count, 133);
assert.equal(jobsMethods.xlm_is_not_a_stripe_currency, true);
assert.equal(jobsMethods.live_flag_armed, false);
assert.equal(jobsMethods.methods.length, 2);
assert.equal(jobsMethods.methods[0].id, "stripe");
assert.equal(jobsMethods.methods[1].id, "xlm_mainnet");
assert.equal(jobsMethods.methods[1].supports_corporate_subscription, false);
assert.equal(jobsMethods.methods[0].status, "not_yet_available");

const servicesMethods = servicesPaymentMethods({
  HAVKAR_REAL_PAYMENTS_ENABLED: "false",
  HAVKAR_SERVICE_PAYMENTS_ENABLED: "false"
});
assert.equal(servicesMethods.commission_bps, 1000);
assert.equal(servicesMethods.customer_extra_havkar_commission, false);
assert.equal(servicesMethods.methods[1].id, "xlm_mainnet");
assert.equal(servicesMethods.live_flag_armed, false);

const jobsPage = fs.readFileSync("jobs.html", "utf8");
assert.match(jobsPage, /Stellar XLM/);
assert.match(jobsPage, /jobs_payment_methods|jobs_quote/);
assert.match(jobsPage, /HAVKAR_JOB_PAYMENTS_ENABLED/);
assert.match(jobsPage, /Business Plus — €99\.99/);
assert.match(jobsPage, /The payment gateway is not connected yet/);
assert.match(jobsPage, /has NOT been activated/);

const servicesPage = fs.readFileSync("services.html", "utf8");
assert.match(servicesPage, /Stellar XLM/);
assert.match(servicesPage, /services_quote/);
assert.match(servicesPage, /1000 bps|10%/);
assert.match(servicesPage, /HAVKAR_SERVICE_PAYMENTS_ENABLED/);

const vercel = fs.readFileSync("vercel.json", "utf8");
assert.match(vercel, /job-checkout/);
assert.match(vercel, /service-commerce/);
assert.match(vercel, /"\/api\/jobs"/);

const api = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(api, /jobs_payment_methods/);
assert.match(api, /services_payment_methods/);
assert.match(api, /handleCommerceRoute/);
assert.match(api, /xlm_is_not_a_stripe_currency/);

const migration = fs.readFileSync(
  "supabase/migrations/20261114060000_jobs_services_marketplace_complete.sql",
  "utf8"
);
assert.match(migration, /job_applications/);
assert.doesNotMatch(migration, /DELETE FROM public\.jobs/);

console.log("JOBS_SERVICES_GLOBAL_PAYMENTS_TEST_OK");
