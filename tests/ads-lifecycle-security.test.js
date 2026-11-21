"use strict";

const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const database = "havkar_ads_lifecycle_security";
const port = process.env.PGPORT || "5432";

function psql(args, input) {
  return execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-p", port, "-v", "ON_ERROR_STOP=1", ...args],
    { encoding: "utf8", input, cwd: root }
  );
}

psql(["-c", `DROP DATABASE IF EXISTS ${database}`]);
psql(["-c", `CREATE DATABASE ${database}`]);

const applied = psql([
  "-d", database,
  "-f", "tests/ads-lifecycle-prelude.sql",
  "-f", "supabase/migrations/20261108010000_ads_production_lifecycle.sql",
  "-f", "tests/ads-lifecycle-security.sql"
]);

assert.match(applied, /ADS_LIFECYCLE_PRELUDE_OK/);
assert.match(applied, /ADS_LIFECYCLE_SECURITY_OK/);
assert.doesNotMatch(applied, /\nERROR:/);

const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261108010000_ads_production_lifecycle.sql"),
  "utf8"
);

assert.match(migration, /pending_review -> paused -> active bypass/);
assert.match(migration, /listing_surface cannot be changed by owners/);
assert.match(migration, /moderation_notes is not owner-writable/);
assert.match(migration, /reported_count is not owner-writable/);
assert.match(migration, /ads_insert_authenticated/);
assert.match(migration, /status = 'pending_review'/);
assert.match(migration, /ads_public_select_marketplace_active/);
assert.match(migration, /DROP POLICY IF EXISTS %I ON public\.ads/);
assert.match(migration, /ON CONFLICT \(ad_id, reporter_id\) DO NOTHING/);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.record_ad_audit_event\(bigint, text, jsonb\)[\s\S]*authenticated/
);
assert.doesNotMatch(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.record_ad_audit_event\(bigint, text, jsonb\) TO authenticated/
);

console.log("ADS_LIFECYCLE_SECURITY_OK");
