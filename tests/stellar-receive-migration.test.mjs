import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(
  "supabase/migrations/20261110194500_stellar_direct_split_settlement.sql",
  "utf8"
);

assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.stellar_receive_accounts/);
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /stellar_receive_accounts_select_own/);
assert.match(sql, /stellar_receive_accounts_insert_own/);
assert.match(sql, /public_key ~ '\^G\[A-Z2-7\]\{55\}\$'/);
assert.match(sql, /ADD COLUMN IF NOT EXISTS settlement_model/);
assert.match(sql, /merchant_destination/);
assert.match(sql, /platform_fee_xlm/);
assert.match(sql, /direct_split/);
assert.match(sql, /platform_collect/);
assert.doesNotMatch(sql, /S[A-Z2-7]{55}/);
assert.match(sql, /never store seeds/i);

const wallet = fs.readFileSync("wallet.html", "utf8");
assert.match(wallet, /saveHAVKARStellarReceiveKey/);
assert.match(wallet, /loadHAVKARStellarReceiveKey/);
assert.match(wallet, /stellar_receive_accounts/);
assert.doesNotMatch(wallet, /secret key value|paste your seed/i);

console.log("STELLAR_RECEIVE_MIGRATION_TEST_OK");
