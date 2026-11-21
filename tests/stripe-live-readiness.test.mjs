/**
 * Ensures the live readiness verifier stays honest:
 * - never auto-allows new live activation
 * - reports Owner-armed collection when already live
 * - rejects unsigned webhooks
 * - status=new on Revolut is not a hard verification blocker
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/verify-stripe-live-readiness.mjs");

const run = spawnSync(process.execPath, [script], {
  encoding: "utf8",
  env: { ...process.env, HAVKAR_APP_URL: "https://havkar.online" }
});

assert.equal(run.status, 0, run.stderr || run.stdout);
const report = JSON.parse(run.stdout);
assert.equal(report.ok, true);
assert.equal(report.live_activation_allowed, false);
assert.ok(
  report.recommendation === "NO-GO" || report.recommendation === "PRESERVE_OWNER_ARMED"
);
assert.ok(
  report.stripe_live_activation === "BLOCKED" ||
    report.stripe_live_activation === "OWNER_ARMED_EXISTING"
);
assert.ok(
  report.evidence.production_customer_facing_collection === "paused" ||
    report.evidence.production_customer_facing_collection === "armed"
);
assert.equal(report.evidence.production_stripe_key_mode, "live");
assert.equal(report.evidence.unsigned_webhook_rejected, true);
assert.match(
  String(report.evidence.unsigned_webhook_response || ""),
  /REAL_PAYMENTS_PAUSED|Missing Stripe signature/i
);
assert.equal(report.stripe_live_account.revolut_default_attached, true);
assert.equal(report.stripe_live_account.bank_status_new_is_blocker, false);
assert.equal(
  report.stripe_live_account.bank_payout_readiness.eligible_for_scheduled_payouts,
  true
);
assert.ok(
  report.blockers.some((b) =>
    /REQUIRED_WEBHOOK_EVENTS|exact-amount|Owner/i.test(b)
  )
);
assert.ok(
  !report.blockers.some((b) => /status is not verified yet/i.test(b))
);
console.log("STRIPE_LIVE_READINESS_TEST_OK");
