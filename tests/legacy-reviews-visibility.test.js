"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const file = path.join(
  __dirname,
  "../supabase/migrations/20261021231851_restrict_legacy_review_visibility.sql"
);
const sql = fs.readFileSync(file, "utf8");

assert.ok(sql.includes('DROP POLICY IF EXISTS "Anyone can view reviews"'));
assert.ok(sql.includes('DROP POLICY IF EXISTS "Anyone can view review replies"'));
assert.ok(sql.includes('DROP POLICY IF EXISTS "Anyone can view review helpful"'));
assert.ok(sql.includes('CREATE POLICY "Users can view own reviews"'));
assert.ok(sql.includes("TO authenticated"));
assert.ok(sql.includes("(SELECT auth.uid()) = user_id"));
assert.ok(!/DELETE\s+FROM/i.test(sql));
assert.ok(!/DROP\s+TABLE/i.test(sql));
assert.ok(!/UPDATE\s+public\.reviews/i.test(sql));
assert.ok(!/service_review/i.test(sql));
assert.ok(!/INSERT\s+INTO/i.test(sql));

console.log("LEGACY_REVIEWS_VISIBILITY_TEST_OK");
