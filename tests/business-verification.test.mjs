import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const helpers = require(path.join(root, "havkar-business-verification.js"));

test("business verification helpers refuse identity files and require three docs", () => {
  assert.deepEqual(
    helpers.missingRequired(["vat_registration"]),
    ["company_registration", "proof_of_registered_address"]
  );
  assert.equal(helpers.validateFile(null).ok, false);
  assert.equal(
    helpers.validateFile({
      type: "application/pdf",
      size: 100,
      name: "passport.pdf"
    }).ok,
    false
  );
  assert.equal(
    helpers.validateFile({
      type: "application/pdf",
      size: 100,
      name: "visura.pdf"
    }).ok,
    true
  );
  assert.match(
    helpers.storagePath("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "vat_registration", "a b.pdf"),
    /^aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1\/vat_registration\/\d+-a_b\.pdf$/
  );
});

test("business verification migration and UI wiring stay private and anti-self-review", () => {
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20261108030000_business_verification_review.sql"),
    "utf8"
  );
  const profile = fs.readFileSync(path.join(root, "profile.html"), "utf8");
  const admin = fs.readFileSync(path.join(root, "admin.html"), "utf8");

  assert.match(migration, /business-evidence/);
  assert.match(migration, /public\.review_business_application/);
  assert.match(migration, /a reviewer cannot decide their own business application/);
  assert.match(migration, /required verification documents missing/);
  assert.match(migration, /vat_number is required before approval/);
  assert.doesNotMatch(migration, /public,\s*true/);
  assert.match(profile, /havkar-business-verification\.js/);
  assert.match(profile, /uploadBusinessEvidence/);
  assert.match(admin, /review_business_application/);
  assert.match(admin, /Self-review is blocked/);
});
