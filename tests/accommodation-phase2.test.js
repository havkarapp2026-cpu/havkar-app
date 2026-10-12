const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const accommodation = require("../havkar-accommodation.js");

const root = path.join(__dirname, "..");
const database = "havkar_accommodation_phase2";

function psql(args, input) {
    return execFileSync("sudo", ["-u", "postgres", "psql", "-p", process.env.PGPORT || "5432", "-v", "ON_ERROR_STOP=1", ...args], {
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
    "-f", "tests/accommodation-phase1.sql",
    "-f", "supabase/migrations/20261013120000_accommodation_phase2_submission.sql",
    "-f", "tests/accommodation-phase2.sql"
]);

assert.match(applied, /ACCOMMODATION_PHASE1_OK/);
assert.match(applied, /ACCOMMODATION_PHASE2_OK/);
assert.doesNotMatch(applied, /ERROR:/);

assert.strictEqual(accommodation.identityVerifiedAllowed(), false);
assert.strictEqual(accommodation.publicationAllowed({
    identityStatus: "verified",
    propertyStatus: "approved",
    countryPublishEnabled: true
}), false);
assert.strictEqual(accommodation.applicationError({
    displayName: "Casa Roma",
    marketingType: "apartment",
    legalCategory: "short_let",
    cin: "abcdefghi123456",
    city: "Roma",
    street: "Via Nazionale",
    streetNumber: "12",
    countryCode: "IT"
}), "");
assert.strictEqual(accommodation.applicationError({
    displayName: "Casa Roma",
    marketingType: "apartment",
    legalCategory: "short_let",
    cin: "abcdefghi123456",
    city: "Roma",
    street: "Via Nazionale",
    streetNumber: "",
    countryCode: "IT"
}), "Building number is required.");
assert.strictEqual(accommodation.applicationError({
    displayName: "Casa Roma",
    marketingType: "apartment",
    legalCategory: "not_a_category",
    cin: "abcdefghi123456",
    city: "Roma",
    street: "Via Nazionale",
    streetNumber: "12",
    countryCode: "IT"
}), "Choose an Italian legal category.");
assert.strictEqual(accommodation.applicationError({
    displayName: "Casa Roma",
    marketingType: "hotel",
    legalCategory: "hotel_structure",
    cin: "short",
    city: "Roma",
    street: "Via Nazionale",
    streetNumber: "12",
    countryCode: "IT"
}), "Italian CIN must be 15 letters or digits.");
assert.strictEqual(accommodation.identityEvidenceBlocked("passport"), true);
assert.strictEqual(accommodation.planIsChargeable({
    status: "active",
    monthly_amount_cents: 1900,
    stripe_price_id: "price_test"
}), true);
assert.strictEqual(accommodation.planIsChargeable({
    status: "draft",
    monthly_amount_cents: null,
    stripe_price_id: null
}), false);
assert.match(accommodation.propertyStatusText("submitted"), /unpublished/);
assert.doesNotMatch(accommodation.propertyStatusText("approved"), /reviewer/i);
assert.match(accommodation.identityStatusText("not_started"), /stays off/);

const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20261013120000_accommodation_phase2_submission.sql"),
    "utf8"
);
assert.strictEqual(migration.includes("user_metadata"), false);
assert.match(migration, /REVOKE SELECT ON public\.accommodation_credentials FROM anon/);
assert.doesNotMatch(migration, /credential_type IN \('cin'/);
assert.match(migration, /caller_email_confirmed/);

const phrases = fs.readFileSync(path.join(root, "havkar-accommodation-i18n.js"), "utf8");
assert.match(phrases, /Numero civico/);
assert.match(phrases, /Tipo di struttura/);
assert.doesNotMatch(phrases, /Tipo di prodotto/);

for (const file of [
    "accommodation.html",
    "accommodation-apply.html",
    "accommodation-property.html",
    "accommodation-documents.html",
    "accommodation-status.html",
    "accommodation-review.html",
    "accommodation-review-case.html"
]) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, /href="login\.html"/);
    assert.match(html, /href="signup\.html"/);
    assert.match(html, /data-i18n-ignore/);
    assert.match(html, /havkar-accommodation-i18n\.js/);
    assert.doesNotMatch(html, /€|EUR\s*19|sample hotel|Verified Accommodation(?! is published)/i);
}

const propertyPage = fs.readFileSync(path.join(root, "accommodation-property.html"), "utf8");
assert.match(propertyPage, /id="streetNumber"/);
assert.match(propertyPage, /Building number/);
assert.match(propertyPage, /Submit for review/);

const documents = fs.readFileSync(path.join(root, "accommodation-documents.html"), "utf8");
assert.match(documents, /Identity documents cannot be uploaded/);
assert.doesNotMatch(documents, /<option value="identity/);
assert.match(documents, /Submit for review/);

const ui = fs.readFileSync(path.join(root, "havkar-accommodation-ui.js"), "utf8");
assert.match(ui, /street_number/);
assert.match(ui, /property_status: "submitted"/);
assert.doesNotMatch(ui, /accommodation_reviews/);
assert.match(ui, /identityVerifiedAllowed|identityStatusText/);

console.log("ACCOMMODATION_PHASE2_TEST_OK");
