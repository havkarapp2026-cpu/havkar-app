import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(
  "supabase/migrations/20261109210000_owner_admin_hardening_and_bootstrap_helpers.sql",
  "utf8"
);
const bootstrap = fs.readFileSync("store/OWNER_IDENTITY_BOOTSTRAP.sql", "utf8");
const operator = fs.readFileSync("havkar-operator-config.js", "utf8");
const admin = fs.readFileSync("admin.html", "utf8");
const profile = fs.readFileSync("profile.html", "utf8");
const support = fs.readFileSync("support.html", "utf8");
const about = fs.readFileSync("about.html", "utf8");

assert.match(sql, /management_events/);
assert.match(sql, /caller_is_admin/);
assert.match(sql, /role_assignments/);
assert.match(sql, /owner_grant_admin/);
assert.match(sql, /owner_revoke_admin/);
assert.match(sql, /bootstrap_primary_owner/);
assert.match(sql, /rollback_bootstrap_owner/);
assert.match(sql, /only the primary owner may grant admin/);
assert.match(sql, /owner cannot keep admin or staff/);
assert.doesNotMatch(sql, /9b34b0bb-271a-49ee-aeb7-a9d28be06a06/);
assert.doesNotMatch(sql, /havkarapp2026@gmail\.com/);
assert.match(sql, /bootstrap_primary_owner/);
assert.match(sql, /Does NOT insert Production owner_identity rows/);

assert.match(bootstrap, /PENDING OWNER APPROVAL/);
assert.match(bootstrap, /9b34b0bb-271a-49ee-aeb7-a9d28be06a06/);
assert.match(bootstrap, /havkarapp2026@gmail\.com/);
assert.match(bootstrap, /PHRASE_HASH_REPLACE_ME/);
assert.match(bootstrap, /rollback_bootstrap_owner/);

assert.match(operator, /Amir Jalilnia/);
assert.match(operator, /info@havkar\.online/);
assert.match(operator, /support@havkar\.online/);
assert.match(operator, /soran@havkar\.online/);
assert.match(operator, /\+39 334 263 2863/);
assert.match(operator, /9b34b0bb-271a-49ee-aeb7-a9d28be06a06/);
assert.match(operator, /hidePersonalEmails:\s*\["amirjalilnia@gmail\.com"\]/);

assert.match(admin, /havkar_owner_dashboard_overview/);
assert.match(admin, /havkar_owner_assign_role/);
assert.match(admin, /Profile entry only/);
assert.doesNotMatch(
  admin,
  /Owner access is active\. Administrator records stay separate\./
);

assert.match(profile, /profileAdministration/);
assert.match(profile, /havkar_session_role/);
assert.match(profile, /havkar_session_is_owner/);
assert.match(profile, /havkar_session_is_admin/);
assert.match(profile, /Staff permissions do not reveal this button/);

assert.match(support, /havkar-operator-config\.js/);
assert.doesNotMatch(support, /amirjalilnia@gmail\.com/);
assert.match(about, /Amir Jalilnia/);
assert.match(about, /soran@havkar\.online/);
assert.doesNotMatch(about, /amirjalilnia@gmail\.com/);

console.log("OWNER_ADMIN_HARDENING_TEST_OK");
