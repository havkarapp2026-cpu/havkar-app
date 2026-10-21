import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20261021220000_event_user_actions_private_select.sql",
  "utf8"
);
const hide = fs.readFileSync("scripts/hide-public-test-event.sql", "utf8");
const events = fs.readFileSync("events.html", "utf8");

assert.match(migration, /DROP POLICY IF EXISTS "Enable read access for all users"/);
assert.match(migration, /USING \(\(SELECT auth\.uid\(\)\) = user_id\)/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.event_interest_counts\(\)/);
assert.match(migration, /user_id/);
const countsFunction = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.event_interest_counts"));
assert.doesNotMatch(countsFunction, /user_id/);
assert.doesNotMatch(migration, /USING \(true\)/);

assert.match(hide, /SET is_public = false/);
assert.match(hide, /title = 'HAVKAR Test Event'/);
assert.match(hide, /id = 1/);
assert.doesNotMatch(hide, /DELETE FROM public\.events/);
assert.doesNotMatch(hide, /event_tickets/);
assert.match(hide, /DO NOT RUN AGAINST PRODUCTION/);

assert.doesNotMatch(events, /select\("event_id,user_id"\)/);
assert.match(events, /event_interest_counts/);
assert.match(events, /\.select\("event_id"\)/);

console.log("EVENT_PRIVACY_TEST_OK");
