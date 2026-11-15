import assert from "node:assert/strict";
import fs from "node:fs";

const jobs = fs.readFileSync("jobs.html", "utf8");
assert.match(jobs, /function startRealPayment\(/);
assert.doesNotMatch(jobs, /async function startRealPayment[\s\S]*?await fetch\("\/api\/global-payments/);
assert.doesNotMatch(
  jobs,
  /function startRealPayment\([\s\S]*?await fetch\("\/api\/global-payments/
);
assert.match(
  jobs,
  /The payment gateway is not connected yet\./
);

const events = fs.readFileSync("events.html", "utf8");
assert.match(events, /supabase\.rpc\("event_interest_counts"\)/);
assert.match(events, /interest counts unavailable/);

const migration = fs.readFileSync(
  "supabase/migrations/20261115132000_event_interest_counts_public_productized.sql",
  "utf8"
);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.event_interest_counts\(\)/);
assert.match(migration, /ev\.is_public IS TRUE/);
assert.match(migration, /ev\.status = 'active'/);
assert.match(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.event_interest_counts\(\) TO anon, authenticated, service_role/
);
assert.doesNotMatch(migration, /user_id/);

console.log("JOBS_EVENTS_HOME_MODULES_TEST_OK");
