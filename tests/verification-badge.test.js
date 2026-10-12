const assert = require("assert");
const fs = require("fs");
const path = require("path");
const verification = require("../havkar-verification.js");

const profile = fs.readFileSync(
  path.join(__dirname, "../profile.html"),
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

assert.ok(profile.includes("HAVKAR_VERIFICATION.serverVerifiedType"));
assert.ok(profile.includes("/havkar-verification.js"));
assert.ok(!profile.includes("metadata.verified === true"));
assert.ok(!profile.includes("metadata.is_verified === true"));

console.log("VERIFICATION_BADGE_TEST_OK");
