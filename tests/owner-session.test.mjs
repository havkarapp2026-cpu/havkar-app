import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(
  "supabase/migrations/20261021221000_havkar_session_is_owner.sql",
  "utf8"
);
const profile = fs.readFileSync("profile.html", "utf8");
const admin = fs.readFileSync("admin.html", "utf8");

assert.match(sql, /havkar_private\.owner_identity/);
assert.match(sql, /session_is_live/);
assert.match(sql, /initial owner requires live acceptance/);
assert.doesNotMatch(sql, /INSERT INTO havkar_private\.owner_identity/);
assert.doesNotMatch(sql, /user_metadata/);
assert.doesNotMatch(sql, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
assert.doesNotMatch(sql, /UPDATE auth\.users/);

assert.match(profile, /havkar_session_is_owner/);
assert.match(profile, /Staff permissions do not reveal this button/);
assert.match(admin, /havkar_session_is_owner/);
assert.match(admin, /admin\.data !== true/);

console.log("OWNER_SESSION_TEST_OK");
