import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(
  "supabase/migrations/20261109220000_owner_dashboard_roles_and_overview.sql",
  "utf8"
);
const operator = fs.readFileSync("havkar-operator-config.js", "utf8");
const admin = fs.readFileSync("admin.html", "utf8");
const profile = fs.readFileSync("profile.html", "utf8");
const about = fs.readFileSync("about.html", "utf8");
const support = fs.readFileSync("support.html", "utf8");
const privacy = fs.readFileSync("privacy.html", "utf8");

assert.match(sql, /caller_is_support/);
assert.match(sql, /havkar_owner_dashboard_overview/);
assert.match(sql, /havkar_owner_assign_role/);
assert.match(sql, /havkar_owner_revoke_role/);
assert.match(sql, /session_is_fresh\(900\)/);
assert.match(sql, /admin_elevation_denied/);
assert.match(sql, /caller_not_owner/);
assert.match(sql, /Return false \(do not RAISE\) so the audit row is not rolled back/);
assert.match(sql, /primary owner cannot be assigned a subordinate role/);
assert.match(sql, /primary owner cannot be revoked/);
assert.match(sql, /soran@havkar\.online/);
assert.match(sql, /payments_live', false/);
assert.doesNotMatch(sql, /INSERT INTO havkar_private\.owner_identity/);
assert.doesNotMatch(sql, /bootstrap_primary_owner/);

assert.match(operator, /legalEntityName:\s*"HAVKAR DI JALILNIA AMIR"/);
assert.match(operator, /soranEmail:\s*"soran@havkar\.online"/);
assert.match(operator, /infoEmail:\s*"info@havkar\.online"/);
assert.match(operator, /supportEmail:\s*"support@havkar\.online"/);
assert.match(operator, /chamberRegistrationStatus:\s*"awaiting_verified_visura"/);
assert.match(operator, /hidePersonalEmails:\s*\["amirjalilnia@gmail\.com"\]/);
assert.match(operator, /havkarapp2026@gmail\.com/);
assert.doesNotMatch(operator, /partitaIva:\s*"[0-9]/);

assert.match(admin, /havkar_owner_dashboard_overview/);
assert.match(admin, /havkar_owner_assign_role/);
assert.match(admin, /havkar_owner_revoke_role/);
assert.match(admin, /Owner \/ Admin dashboard · Profile entry only/);
assert.match(admin, /SORAN mailbox content is not available to Admin/);
assert.doesNotMatch(admin, /ownerAllowed/);
assert.doesNotMatch(admin, /amirjalilnia@gmail\.com/);

assert.match(profile, /havkar_session_role/);
assert.match(profile, /goTo\('admin\.html'\)/);

assert.match(about, /soran@havkar\.online/);
assert.match(about, /Owner \/ Investment/);
assert.doesNotMatch(about, /amirjalilnia@gmail\.com/);
assert.doesNotMatch(support, /amirjalilnia@gmail\.com/);
assert.doesNotMatch(privacy, /amirjalilnia@gmail\.com/);
assert.match(support, /support@havkar\.online/);
assert.match(privacy, /support@havkar\.online/);

console.log("OWNER_DASHBOARD_ROLES_TEST_OK");
