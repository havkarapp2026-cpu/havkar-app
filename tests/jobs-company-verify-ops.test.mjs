import assert from "node:assert/strict";
import fs from "node:fs";
import jobs from "../havkar-jobs.js";

const api = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(api, /jobs_company_list_review/);
assert.match(api, /jobs_company_submit_review/);
assert.match(api, /jobs_company_verify/);
assert.doesNotMatch(
  api,
  /jobs_company_verify[\s\S]{0,800}updated_at:\s*new Date/
);
assert.match(api, /verification_status must be verified, rejected, pending, or unverified/);
assert.match(api, /SELF_VERIFY_BLOCKED/);

const page = fs.readFileSync("jobs.html", "utf8");
assert.match(page, /setJobsRoleMode/);
assert.match(page, /submitCompanyForOwnerReview/);
assert.match(page, /jobs_company_submit_review/);
assert.match(page, /employer_kind:\s*verifiedCompany \? "company" : "ordinary"/);
assert.match(page, /maxlength="160"/);

const admin = fs.readFileSync("admin.html", "utf8");
assert.match(admin, /jobsCompanyReviewPanel/);
assert.match(admin, /jobs_company_list_review/);
assert.match(admin, /jobs_company_verify/);
assert.match(admin, /Companies are never auto-verified/);

const tooLong = "A".repeat(161);
const reg = await jobs.registerCompany(
  {
    from() {
      return {
        insert() {
          return {
            select() {
              return {
                single: async () => ({ data: null, error: { message: "should not insert" } })
              };
            }
          };
        }
      };
    }
  },
  { userId: "00000000-0000-4000-8000-000000000001", legal_name: tooLong }
);
assert.equal(reg.ok, false);

assert.equal(jobs.companyMayUseCorporate({ verification_status: "pending" }).ok, false);
assert.equal(jobs.companyMayUseCorporate({ verification_status: "rejected" }).ok, false);
assert.equal(jobs.companyMayUseCorporate({ verification_status: "verified" }).ok, true);

console.log("JOBS_COMPANY_VERIFY_OPS_TEST_OK");
