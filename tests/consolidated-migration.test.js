const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");

const migrationPath = "supabase/migrations/20261012231344_service_commission_and_accommodation_owner_tools.sql";
const sql = fs.readFileSync(migrationPath);
const sha256 = crypto.createHash("sha256").update(sql).digest("hex");
const md5 = crypto.createHash("md5").update(sql).digest("hex");

assert.strictEqual(sql.length, 26963);
assert.strictEqual(sha256, "0b484a0489f7dbee2f756f22d863f29230a69b021ccc4c998246411c05439229");
assert.strictEqual(md5, "06d9746fbac5675c2303699fee5bb4fb");
assert.strictEqual(fs.existsSync("supabase/migrations/20261013140000_service_commission_ledger.sql"), false);
assert.strictEqual(fs.existsSync("supabase/migrations/20261013140100_accommodation_owner_tools.sql"), false);
assert.strictEqual(fs.existsSync("supabase/migrations/20261012160000_accommodation_phase1.sql"), true);
assert.strictEqual(fs.existsSync("supabase/migrations/20261013120000_accommodation_phase2_submission.sql"), true);
assert.doesNotMatch(sql.toString(), /^(COMMIT|ROLLBACK|VACUUM)\b/m);
assert.doesNotMatch(sql.toString(), /CONCURRENTLY/);
assert.match(sql.toString(), /collection_state = 'uncollected'/);
assert.match(sql.toString(), /SELECT false;/);

console.log("CONSOLIDATED_MIGRATION_OK");
