const assert = require("assert");
const fs = require("fs");

const ledger = fs.readFileSync(
  "supabase/migrations/20261013140000_service_commission_ledger.sql"
);
const ownerTools = fs.readFileSync(
  "supabase/migrations/20261013140100_accommodation_owner_tools.sql"
);
const consolidated = fs.readFileSync(
  "supabase/production-pending/service_commission_and_accommodation_owner_tools.sql"
);

assert.ok(ledger.length > 0);
assert.ok(ownerTools.length > 0);
assert.deepStrictEqual(consolidated, Buffer.concat([ledger, ownerTools]));
assert.doesNotMatch(consolidated.toString(), /^(COMMIT|ROLLBACK|VACUUM)\b/m);
assert.doesNotMatch(consolidated.toString(), /CONCURRENTLY/);
assert.match(consolidated.toString(), /collection_state = 'uncollected'/);
assert.match(
  consolidated.toString(),
  /SELECT false;\s*\$\$;\s*\n\nREVOKE ALL ON FUNCTION havkar_private\.accommodation_booking_enabled/
);

console.log("CONSOLIDATED_MIGRATION_OK");
