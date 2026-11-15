import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  logoEntitlementDecision,
  refuseUnverifiedPaidOutput,
  entitlementFromVerifiedPrepaidCredit,
  activePlan,
  planFromCreditPack
} = require("../lib/havkar-ai-entitlements.cjs");

assert.equal(planFromCreditPack("ai_credits_plus"), "plus");
assert.equal(planFromCreditPack("ai_credits_pro"), "pro");
assert.equal(planFromCreditPack("ai_credits_business"), "business");

const free = logoEntitlementDecision(
  { ok: true, row: { plan_code: "free", status: "active" } },
  { mode: "image", aspect: "1:1", prompt: "logo" }
);
assert.equal(free.allowed, false);
assert.equal(free.status, 403);

const paid = logoEntitlementDecision(
  {
    ok: true,
    row: {
      plan_code: "pro",
      status: "active",
      current_period_end: new Date(Date.now() + 86400000).toISOString()
    }
  },
  { mode: "image", aspect: "1:1", prompt: "logo mark" }
);
assert.equal(paid.allowed, true);
assert.equal(paid.plan, "pro");

const advice = logoEntitlementDecision(
  { ok: true, row: { plan_code: "free", status: "active" } },
  { task: "general", messages: [{ role: "user", content: "hello" }] }
);
assert.equal(advice.required, false);
assert.equal(advice.allowed, true);

const unverified = refuseUnverifiedPaidOutput();
assert.equal(unverified.fulfilled, false);
assert.equal(unverified.paid, false);

const badHash = entitlementFromVerifiedPrepaidCredit({
  subject_id: "ai_credits_plus",
  paid: false,
  order_paid: false,
  tx_hash: "abc"
});
assert.equal(badHash.ok, false);

const good = entitlementFromVerifiedPrepaidCredit({
  subject_id: "ai_credits_plus",
  paid: true,
  order_paid: true
});
assert.equal(good.ok, true);
assert.equal(good.plan_code, "plus");
assert.equal(good.status, "active");
assert.equal(activePlan(good), "plus");

console.log("HAVKAR_AI_ENTITLEMENTS_TEST_OK");
