import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jobs = require("../havkar-jobs.js");
const billing = require("../havkar-job-billing.js");
const {
  JOB_LISTING_PLANS,
  JOB_CORPORATE_SUBSCRIPTIONS
} = require("../lib/havkar-global-payments.cjs");
const { jobsPaymentMethods } = require("../lib/jobs-services-payments.cjs");
const { PRESENTMENT_COUNT } = require("../lib/stripe-supported-currencies-60.cjs");

assert.equal(PRESENTMENT_COUNT, 133);

assert.equal(billing.ORDINARY_PLANS.Basic.eur, 9.99);
assert.equal(billing.ORDINARY_PLANS.Professional.eur, 19.99);
assert.equal(billing.ORDINARY_PLANS.Business.eur, 39.99);
assert.equal(billing.ORDINARY_PLANS.Basic.durationDays, 30);
assert.equal(billing.COMPANY_PLANS.business.eur, 49.99);
assert.equal(billing.COMPANY_PLANS.business_plus.eur, 99.99);
assert.equal(billing.COMPANY_PLANS.enterprise.eur, 199.99);
assert.equal(billing.COMPANY_PLANS.business.activeAdvertisementLimit, 10);
assert.equal(billing.COMPANY_PLANS.business_plus.activeAdvertisementLimit, 30);
assert.equal(billing.COMPANY_PLANS.enterprise.activeAdvertisementLimit, 100);

assert.equal(billing.companyMaySubscribe({ verification_status: "pending" }).ok, false);
assert.equal(billing.companyMaySubscribe({ verification_status: "verified" }).ok, true);
assert.equal(billing.paymentsEnabled({ HAVKAR_JOB_PAYMENTS_ENABLED: "false" }), false);
assert.equal(billing.paymentsEnabled({}), false);

const methods = jobsPaymentMethods({
  HAVKAR_JOB_PAYMENTS_ENABLED: "false",
  HAVKAR_REAL_PAYMENTS_ENABLED: "false"
});
assert.equal(methods.live_flag_armed, false);
assert.equal(methods.public_live_charging, false);
assert.equal(methods.stripe_presentment_count, 133);
assert.ok(methods.methods.some((m) => m.id === "xlm_mainnet" && m.supports_corporate_subscription === false));

assert.ok(JOB_LISTING_PLANS.every((p) => p.billing === "one_time_prepaid"));
assert.ok(JOB_CORPORATE_SUBSCRIPTIONS.every((p) => p.billing === "stripe_subscription_monthly"));

const api = fs.readFileSync(new URL("../api/create-event-checkout.js", import.meta.url), "utf8");
assert.match(api, /companyMaySubscribe/);
assert.match(api, /verification_status/);
assert.match(api, /Corporate monthly subscriptions renew on Stripe only/);

const page = fs.readFileSync(new URL("../jobs.html", import.meta.url), "utf8");
assert.match(page, /Ordinary employer — choose a 30-day prepaid listing plan/);
assert.match(page, /Verified company — monthly subscription \(auto-renew\)/);
assert.match(page, /Business — €49\.99 \/ month/);
assert.match(page, /Business Plus — €99\.99 \/ month/);
assert.match(page, /Enterprise — €199\.99 \/ month/);
assert.match(page, /params\.get\("mine"\)/);
assert.match(page, /submitInAppApplication/);
assert.match(page, /registerJobCompany/);
assert.match(page, /133 fiat display codes \+ separate XLM/);
assert.doesNotMatch(page, /<h2>\s*Monthly subscription\s*<\/h2>/);
assert.match(page, /<h2>\s*30-day prepaid listing\s*<\/h2>/);

const i18n = fs.readFileSync(new URL("../havkar-ui-i18n21.js", import.meta.url), "utf8");
assert.match(i18n, /"jobs":\{/);
assert.match(i18n, /"Submit application"/);
assert.match(i18n, /"Pending payment"/);
assert.match(i18n, /"Display currency"/);

assert.equal(
  jobs.buildJobInsert(
    {
      title: "Cook",
      company: "Kitchen",
      location: "Crotone",
      type: "Full-time",
      description: "Cook evening meals for guests.",
      employer_kind: "company",
      company_id: "11111111-1111-1111-1111-111111111111",
      company_record: { verification_status: "unverified" },
      currency: "EUR"
    },
    "11111111-1111-1111-1111-111111111111",
    { name: "Basic", price: 9.99 }
  ).reason,
  "company_not_verified"
);

console.log("JOBS_EMPLOYMENT_STABILIZE_TEST_OK");
