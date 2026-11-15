import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20261115124500_platform_security_rpc_hardening.sql",
  "utf8"
);

assert.match(migration, /SET search_path TO 'public'/);
assert.match(migration, /havkar_is_reaction_emoji/);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.havkar_is_reaction_emoji\(text\) FROM PUBLIC, anon/
);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.havkar_get_or_create_listing_conversation\(bigint\)/
);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.event_interest_counts\(\) FROM PUBLIC, anon/
);
assert.match(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.havkar_is_reaction_emoji\(text\) TO authenticated, service_role/
);

const userBlocks = fs.readFileSync(
  "supabase/migrations/20261110183000_user_blocks_and_event_interest_anon_revoke.sql",
  "utf8"
);
assert.match(userBlocks, /CREATE TABLE IF NOT EXISTS public\.user_blocks/);
assert.match(userBlocks, /ENABLE ROW LEVEL SECURITY/);
assert.match(userBlocks, /REVOKE ALL ON TABLE public\.user_blocks FROM PUBLIC, anon/);

const vercel = fs.readFileSync("vercel.json", "utf8");
assert.match(vercel, /"\/api\/payment-status"/);
assert.match(vercel, /havkarAction=paymentStatus/);
assert.match(vercel, /"\/api\/global-payments"/);

console.log("PLATFORM_SECURITY_RPC_HARDENING_TEST_OK");
