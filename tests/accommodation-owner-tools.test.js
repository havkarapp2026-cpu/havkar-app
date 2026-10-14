const assert = require("assert");
const { execFileSync } = require("child_process");
const accommodation = require("../havkar-accommodation.js");

const database = "havkar_accommodation_owner_tools";
const port = process.env.PGPORT || "5433";

function psql(args, input) {
  return execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-p", port, "-v", "ON_ERROR_STOP=1", ...args],
    { encoding: "utf8", input }
  );
}

psql(["-c", `DROP DATABASE IF EXISTS ${database}`]);
psql(["-c", `CREATE DATABASE ${database}`]);
// Supabase service_role bypasses row security. The local role does not.
// The existing review call reads the property id as service_role.
psql(["-c", "ALTER ROLE service_role BYPASSRLS"]);

let applied;
try {
applied = psql([
  "-d", database,
  "-f", "tests/accommodation-phase1-prelude.sql",
  "-f", "supabase/migrations/20261012160000_accommodation_phase1.sql",
  "-f", "tests/accommodation-phase1.sql",
  "-f", "supabase/migrations/20261013120000_accommodation_phase2_submission.sql",
  "-f", "tests/auth-jwt-stub.sql",
  "-f", "tests/service-commission-prelude.sql",
  "-f", "supabase/migrations/20261012231344_service_commission_and_accommodation_owner_tools.sql",
  "-f", "supabase/migrations/20261014224500_owner_identity.sql",
  "-f", "tests/accommodation-owner-tools.sql"
]);
} finally {
  psql(["-c", "ALTER ROLE service_role NOBYPASSRLS"]);
}

assert.match(applied, /ACCOMMODATION_PHASE1_OK/);
assert.match(applied, /ACCOMMODATION_OWNER_TOOLS_OK/);
assert.doesNotMatch(applied, /ERROR:/);
assert.strictEqual(accommodation.ownerPhotoAllowed(
  "11111111-1111-4111-8111-111111111111",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "front.jpg"
), true);
assert.strictEqual(accommodation.ownerPhotoAllowed(
  "11111111-1111-4111-8111-111111111111",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "passport.jpg"
), false);
assert.strictEqual(accommodation.priceDraftChargeable({
  nightly_amount_cents: 7900,
  charge_status: "not_charged"
}), false);
assert.strictEqual(accommodation.availabilityState("blocked"), "blocked");
assert.strictEqual(accommodation.availabilityState("booked"), "");
assert.strictEqual(accommodation.publicationAllowed({
  identityStatus: "verified",
  propertyStatus: "approved",
  countryPublishEnabled: true
}), false);

console.log("ACCOMMODATION_OWNER_TOOLS_OK");
