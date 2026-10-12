const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const accommodation = require("../havkar-accommodation.js");

const root = path.join(__dirname, "..");
const database = "havkar_accommodation_phase1";

function psql(args, input) {
    return execFileSync("sudo", ["-u", "postgres", "psql", "-p", "5432", "-v", "ON_ERROR_STOP=1", ...args], {
        cwd: root,
        encoding: "utf8",
        input
    });
}

psql(["-c", `DROP DATABASE IF EXISTS ${database}`]);
psql(["-c", `CREATE DATABASE ${database}`]);

const applied = psql([
    "-d", database,
    "-f", "tests/accommodation-phase1-prelude.sql",
    "-f", "supabase/migrations/20261012160000_accommodation_phase1.sql",
    "-f", "tests/accommodation-phase1.sql"
]);

assert.match(applied, /ACCOMMODATION_PHASE1_OK/);
assert.doesNotMatch(applied, /ERROR:/);

assert.strictEqual(accommodation.identityVerifiedAllowed(), false);
assert.deepStrictEqual(
    accommodation.verifiedFromMetadata({ verified: true, is_verified: true }),
    { identity: false, property: false }
);
assert.strictEqual(accommodation.publicationAllowed({
    identityStatus: "verified",
    propertyStatus: "approved",
    countryPublishEnabled: true
}), false);
assert.strictEqual(accommodation.cinShapeValid("abcdefghi123456"), true);
assert.strictEqual(accommodation.cinShapeValid("short"), false);
assert.strictEqual(accommodation.identityEvidenceBlocked("passport"), true);
assert.strictEqual(accommodation.evidencePathAllowed(
    "11111111-1111-4111-8111-111111111111",
    "11111111-1111-4111-8111-111111111111/property/identity/card.pdf",
    "cin_record"
), false);
assert.strictEqual(accommodation.reviewDecisionError("identity_verified"), "This decision is not available.");
assert.strictEqual(accommodation.planIsChargeable({
    status: "draft",
    monthly_amount_cents: null,
    stripe_price_id: null
}), false);

const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20261012160000_accommodation_phase1.sql"),
    "utf8"
);
assert.strictEqual(migration.includes("user_metadata"), false);
assert.strictEqual(migration.includes("listing_kind"), false);

const documents = fs.readFileSync(path.join(root, "accommodation-documents.html"), "utf8");
assert.strictEqual(documents.includes("identity_document"), false);
assert.strictEqual(documents.includes("passport"), true);
assert.match(documents, /Identity documents cannot be uploaded/);
assert.doesNotMatch(documents, /<option value="identity/);

for (const file of [
    "accommodation.html",
    "accommodation-apply.html",
    "accommodation-property.html",
    "accommodation-status.html",
    "accommodation-review.html"
]) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(html, /€|EUR\s*19|sample hotel|Verified Accommodation(?! is published)/i);
}

const reviewApi = fs.readFileSync(path.join(root, "api/accommodation-review.js"), "utf8");
assert.strictEqual(reviewApi.includes("identity_status"), false);
assert.match(reviewApi, /identityVerified: false/);

console.log("ACCOMMODATION_PHASE1_TEST_OK");
