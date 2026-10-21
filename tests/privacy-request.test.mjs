import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/20261021222000_privacy_requests.sql", "utf8");
const page = fs.readFileSync("privacy-request.html", "utf8");
const support = fs.readFileSync("support.html", "utf8");

assert.match(sql, /CREATE TABLE public\.privacy_requests/);
assert.match(sql, /request_type IN \('deletion', 'export'\)/);
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /\(SELECT auth\.uid\(\)\) = user_id/);
assert.doesNotMatch(sql, /DELETE FROM auth\.users/);
assert.doesNotMatch(sql, /wallet/);
assert.doesNotMatch(sql, /FOR DELETE/);
assert.doesNotMatch(sql, /FOR UPDATE/);

assert.match(page, /supabase\.auth\.getUser\(\)/);
assert.match(page, /privacy_requests/);
assert.match(page, /Nothing was deleted/);
assert.doesNotMatch(page, /auth\.admin\.deleteUser/);
assert.match(support, /privacy-request\.html/);

console.log("PRIVACY_REQUEST_TEST_OK");
