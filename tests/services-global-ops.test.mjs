import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ops = require("../lib/services-global-ops.cjs");
const handlers = require("../lib/services-ops-handlers.cjs");

assert.equal(ops.assertConnectCountryAllowed("IT").ok, true);
assert.equal(ops.assertConnectCountryAllowed("XX").ok, false);
assert.equal(ops.assertConnectCountryAllowed("").ok, false);
assert.ok(ops.STRIPE_CONNECT_EXPRESS_COUNTRIES.some((c) => c.code === "DE"));
assert.equal(ops.categoryRequiresLicense("Electrical"), true);
assert.equal(ops.categoryRequiresLicense("Cleaning"), false);
assert.equal(ops.slotOverlaps("09:00", "12:00", "10:30"), true);
assert.equal(ops.slotOverlaps("09:00", "12:00", "12:00"), false);

const plan = ops.planServiceRefund({
  agreedCents: 100,
  commissionCents: 10,
  providerSettlementCents: 90,
  refundCents: 100,
  currency: "EUR"
});
assert.equal(plan.ok, true);
assert.equal(plan.refund_commission_cents, 10);
assert.equal(plan.refund_provider_settlement_cents, 90);
assert.equal(plan.requires_owner_approval, true);
assert.equal(plan.executes_stripe_refund, false);

assert.equal(handlers.isServicesOpsAction("services_staff_panel"), true);
assert.equal(handlers.isServicesOpsAction("services_buy_checkout"), false);
assert.equal(handlers.isServicesOpsAction("services_credential_review"), true);
assert.equal(handlers.isServicesOpsAction("services_availability_list"), true);

const safe = ops.staffServicesPanelSafe([
  {
    id: 1,
    booking_id: 3,
    status: "open",
    category: "x",
    created_at: "t",
    secret_ledger: "nope",
    commission_cents: 999
  }
]);
assert.equal(safe[0].id, 1);
assert.equal(safe[0].commission_cents, undefined);

console.log("services-global-ops.test.mjs: OK");
