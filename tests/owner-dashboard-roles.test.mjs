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
assert.match(operator, /registrationNumber:\s*"KR234170"/);
assert.match(operator, /registeredAddress:\s*"Francesco Antonio Lucifero 40, 88900 Crotone, Italy"/);
assert.match(
  operator,
  /chamberRegistrationStatus:\s*"registration_number_from_revolut_business_2026-11-09"/
);
assert.match(operator, /hidePersonalEmails:\s*\["amirjalilnia@gmail\.com"\]/);
assert.match(operator, /havkarapp2026@gmail\.com/);
assert.doesNotMatch(operator, /partitaIva:\s*"[0-9]/);
assert.doesNotMatch(operator, /LT16\s*3250|REVOLT21/);

assert.match(admin, /havkar_owner_dashboard_overview/);
assert.match(admin, /havkar_owner_assign_role/);
assert.match(admin, /havkar_owner_revoke_role/);
assert.match(admin, /Owner \/ Admin dashboard · Profile entry only/);
assert.match(admin, /SORAN mailbox content is not available to Admin/);
assert.doesNotMatch(admin, /ownerAllowed/);
assert.doesNotMatch(admin, /amirjalilnia@gmail\.com/);

assert.match(profile, /havkar_session_role/);
assert.match(profile, /goTo\('admin\.html'\)/);
assert.match(profile, /goTo\('staff\.html'\)/);
assert.match(profile, /profileStaffWorkspace/);

assert.match(about, /soran@havkar\.online/);
assert.match(about, /Owner \/ Investment/);
assert.match(about, /KR234170/);
assert.doesNotMatch(about, /amirjalilnia@gmail\.com/);
assert.doesNotMatch(about, /LT16\s*3250|REVOLT21/);
assert.doesNotMatch(support, /amirjalilnia@gmail\.com/);
assert.doesNotMatch(privacy, /amirjalilnia@gmail\.com/);
assert.match(support, /support@havkar\.online/);
assert.match(privacy, /support@havkar\.online/);
assert.match(privacy, /KR234170/);

const staffPage = fs.readFileSync("staff.html", "utf8");
const staffSql = fs.readFileSync(
  "supabase/migrations/20261109240000_staff_workspace_and_owner_finance.sql",
  "utf8"
);
const index = fs.readFileSync("index.html", "utf8");
assert.match(staffPage, /havkar_staff_workspace_overview/);
assert.match(staffPage, /noindex/);
assert.match(staffSql, /havkar_owner_finance_ledger_summary/);
assert.match(staffSql, /caller_is_owner/);
assert.doesNotMatch(index, /staff\.html/);
assert.match(admin, /havkar_owner_finance_ledger_summary/);

console.log("OWNER_DASHBOARD_ROLES_TEST_OK");
