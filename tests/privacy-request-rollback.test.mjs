import assert from "node:assert/strict";
import fs from "node:fs";

const reviewRollback = fs.readFileSync(
  "supabase/rollbacks/20261025162743_privacy_request_admin_review.sql",
  "utf8"
);
const privilege = fs.readFileSync(
  "supabase/migrations/20261103150000_privacy_request_privilege_revoke.sql",
  "utf8"
);
const privilegeRollback = fs.readFileSync(
  "supabase/rollbacks/20261103150000_privacy_request_privilege_revoke.sql",
  "utf8"
);

assert.match(reviewRollback, /DROP POLICY IF EXISTS "Administrators read privacy requests"/);
assert.match(reviewRollback, /DROP POLICY IF EXISTS "Administrators mark privacy requests in review"/);
assert.match(reviewRollback, /CHECK \(status = 'requested'\)/);
assert.match(privilege, /REVOKE ALL ON TABLE public\.privacy_requests FROM authenticated/);
assert.match(privilege, /GRANT UPDATE \(status\)/);
assert.match(privilegeRollback, /TRUNCATE/);

for (const sql of [reviewRollback, privilege, privilegeRollback]) {
  assert.doesNotMatch(sql, /DELETE FROM/);
  assert.doesNotMatch(sql, /auth\.users/);
  assert.doesNotMatch(sql, /TRUNCATE public\.privacy_requests/);
}

console.log("PRIVACY_REQUEST_ROLLBACK_TEST_OK");
