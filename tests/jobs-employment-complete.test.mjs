import assert from "node:assert/strict";
import fs from "node:fs";
import jobs from "../havkar-jobs.js";
import billing from "../havkar-job-billing.js";

assert.equal(jobs.CORPORATE_PLANS.business.eur, 49.99);
assert.equal(jobs.CORPORATE_PLANS.business.activeAdvertisementLimit, 10);
assert.equal(jobs.CORPORATE_PLANS.business_plus.eur, 99.99);
assert.equal(jobs.CORPORATE_PLANS.business_plus.activeAdvertisementLimit, 30);
assert.equal(jobs.CORPORATE_PLANS.enterprise.eur, 199.99);
assert.equal(jobs.CORPORATE_PLANS.enterprise.activeAdvertisementLimit, 100);

assert.equal(billing.COMPANY_PLANS.business.eur, 49.99);
assert.equal(billing.COMPANY_PLANS.business_plus.cents, 9999);
assert.equal(billing.COMPANY_PLANS.enterprise.activeAdvertisementLimit, 100);

assert.equal(jobs.PLANS.Basic, 9.99);
assert.equal(jobs.PLANS.Professional, 19.99);
assert.equal(jobs.PLANS.Business, 39.99);

const remote = jobs.validateJobDraft({
  title: "Remote Engineer",
  company: "HAVKAR",
  type: "Remote",
  description: "Ship production Jobs features for employers and applicants."
});
assert.equal(remote.ok, true);
assert.equal(remote.value.location, "Remote");

assert.equal(
  jobs.companyMayUseCorporate({ verification_status: "unverified" }).ok,
  false
);
assert.equal(
  jobs.companyMayUseCorporate({ verification_status: "verified" }).ok,
  true
);

const page = fs.readFileSync("jobs.html", "utf8");
assert.match(page, /jobs_checkout/);
assert.match(page, /jobs_subscription_checkout/);
assert.match(page, /startCorporateSubscriptionCheckout/);
assert.match(page, /jobsPayoutHonesty/);
assert.match(page, /submitInAppApplication/);
assert.match(page, /Business Plus — €99\.99/);
assert.match(page, /havkar-job-applications\.js/);

const api = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(api, /jobs_subscription_checkout/);
assert.match(api, /jobs_company_verify/);
assert.match(api, /mode:\s*"subscription"/);
assert.match(api, /platform_listing_fee_only/);

const webhook = fs.readFileSync("api/stripe-webhook.js", "utf8");
assert.match(webhook, /isJobBillingEvent/);
assert.match(webhook, /applyVerifiedCheckoutSession/);

console.log("JOBS_EMPLOYMENT_COMPLETE_TEST_OK");
