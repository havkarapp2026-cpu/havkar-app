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
assert.match(page, /jobsPublishTip/);
assert.match(page, /jobs-publish-tip/);
assert.match(page, /id="jobsPostFab"/);
assert.match(page, /onclick="openPostJob\(event\)"/);
assert.match(page, /bindJobsPostFab/);
assert.match(page, /z-index:220/);
assert.match(
  page,
  /\.plan\[data-plan="Basic"\]\[data-billing="one_time_prepaid"\]/
);
assert.doesNotMatch(
  page,
  /\.plan\[data-plan="Basic"\s*\n\s*data-billing/
);
assert.match(
  page,
  /انتشار آگهی استخدام پس از پرداخت هزینه و تأیید تراکنش انجام می‌شود/
);
assert.doesNotMatch(page, /jobsPayoutHonesty/);
assert.doesNotMatch(page, /Seller Connect bank payout/);
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

assert.match(page, /jobsWizardStep1/);
assert.match(page, /jobsWizardNext/);
assert.match(page, /companiesModal/);
assert.match(page, /openCompaniesPanel/);
assert.match(page, /havkar-jobs-i18n\.js/);
assert.match(page, /havkar-presentment-currencies\.js/);
assert.match(page, /includeXlm:\s*false/);
assert.match(page, /JOBS_DRAFT_KEY|havkar_jobs_post_draft/);

console.log("JOBS_EMPLOYMENT_COMPLETE_TEST_OK");
