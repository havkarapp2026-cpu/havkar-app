import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

test("business application owner reassignment stays privileged and non-approving", () => {
  const sql = fs.readFileSync(
    path.join(root, "supabase/migrations/20261108040000_business_application_owner_reassign.sql"),
    "utf8"
  );
  assert.match(sql, /reassign_business_application_owner/);
  assert.match(sql, /business_application_ownership_events/);
  assert.match(sql, /privileged ownership reassignment required/);
  assert.match(sql, /approved applications cannot be reassigned/);
  assert.match(sql, /target user already has a business application/);
  assert.doesNotMatch(sql, /status\s*=\s*'approved'/);
  assert.match(sql, /GRANT EXECUTE[\s\S]*TO service_role/);
  assert.match(sql, /REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated/);
});
