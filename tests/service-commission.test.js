const assert = require("assert");
const { execFileSync } = require("child_process");
const services = require("../havkar-services.js");

const database = "havkar_service_commission";
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

const applied = psql([
  "-d", database,
  "-f", "tests/accommodation-phase1-prelude.sql",
  "-f", "tests/service-commission-prelude.sql",
  "-f", "supabase/migrations/20261012160000_accommodation_phase1.sql",
  "-f", "supabase/migrations/20261013120000_accommodation_phase2_submission.sql",
  "-f", "supabase/migrations/20261012231344_service_commission_and_accommodation_owner_tools.sql",
  "-f", "supabase/migrations/20261014224500_owner_identity.sql",
  "-f", "tests/service-commission.sql"
]);

assert.match(applied, /SERVICE_COMMISSION_TEST_OK/);
assert.doesNotMatch(applied, /ERROR:/);

const split = services.commissionFromCents(1055);
assert.strictEqual(split.customerChargeCents, 1055);
assert.strictEqual(split.commissionBps, 1000);
assert.strictEqual(split.commissionCents, 106);
assert.strictEqual(split.providerSettlementCents, 949);
assert.strictEqual(split.payer, "provider");
assert.strictEqual(split.processingFeeCents, 0);
assert.strictEqual(split.taxCents, 0);
assert.strictEqual(split.collectionState, "uncollected");
assert.strictEqual(services.commissionFromCents(10.5), null);
assert.match(services.liabilityText("owed"), /Not collected/);
assert.match(services.liabilityText("void"), /Not owed/);
assert.match(services.liabilityText("recorded"), /not collected/i);

console.log("SERVICE_COMMISSION_TEST_OK");
