const assert = require("assert");
const fs = require("fs");
const path = require("path");
const verification = require("../havkar-verification.js");

const profile = fs.readFileSync(
  path.join(__dirname, "../profile.html"),
  "utf8"
);
const css = fs.readFileSync(
  path.join(__dirname, "../havkar-verification-badges.css"),
  "utf8"
);
const migration = fs.readFileSync(
  path.join(
    __dirname,
    "../supabase/migrations/20261112200000_finance_accounting_and_verification_badges.sql"
  ),
  "utf8"
);

const selfAssigned = {
  user_metadata: {
    verified: true,
    is_verified: true,
    verification_type: "business",
    account_type: "admin"
  }
};

assert.strictEqual(verification.serverVerifiedType(selfAssigned), "");
assert.strictEqual(verification.serverVerifiedType({
  user_metadata: { verified: true },
  app_metadata: { verified: "true", verification_type: "business" }
}), "");
assert.strictEqual(verification.serverVerifiedType({
  app_metadata: { verified: true, verification_type: "admin" }
}), "");
assert.strictEqual(verification.serverVerifiedType({
  app_metadata: { is_verified: true, account_type: "business" }
}), "business");
assert.strictEqual(verification.serverVerifiedType({
  app_metadata: { verified: true, verification_type: "factory" }
}), "company");
assert.strictEqual(verification.serverVerifiedType({
  app_metadata: { verified: true }
}), "personal");

assert.match(verification.renderBadgeHtml("personal"), /Verified Person/);
assert.match(verification.renderBadgeHtml("business"), /Verified Business/);
assert.match(verification.renderBadgeHtml("company"), /Verified Company \/ Factory/);
assert.match(verification.renderBadgeHtml("personal"), /havkar-badge personal/);
assert.deepStrictEqual(
  verification.typesFromCaseRows([
    { badge_type: "personal", status: "approved" },
    { badge_type: "business", status: "pending" },
    { badge_type: "company", status: "approved", expires_at: "2000-01-01T00:00:00Z" }
  ]),
  ["personal"]
);

assert.ok(profile.includes("HAVKAR_VERIFICATION.serverVerifiedType") || profile.includes("HAVKAR_VERIFICATION.renderBadgeHtml"));
assert.ok(profile.includes("/havkar-verification.js"));
assert.ok(profile.includes("/havkar-verification-badges.css"));
assert.ok(!profile.includes("metadata.verified === true"));
assert.ok(!profile.includes("metadata.is_verified === true"));

assert.match(css, /glossy|radial-gradient|havkar-green/i);
assert.match(migration, /havkar_review_verification_case/);
assert.match(migration, /paid_auto_award/);
assert.match(migration, /badge_type text NOT NULL/);

console.log("VERIFICATION_BADGE_TEST_OK");
