/**
 * Ensures the live readiness verifier stays honest: collection paused,
 * live key mode reported, activation never auto-allowed.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/verify-stripe-live-readiness.mjs");

const run = spawnSync(process.execPath, [script], {
  encoding: "utf8",
  env: { ...process.env, HAVKAR_APP_URL: "https://havkar-app.vercel.app" }
});

assert.equal(run.status, 0, run.stderr || run.stdout);
const report = JSON.parse(run.stdout);
assert.equal(report.ok, true);
assert.equal(report.live_activation_allowed, false);
assert.equal(report.recommendation, "NO-GO");
assert.equal(report.stripe_live_activation, "BLOCKED");
assert.equal(report.evidence.production_customer_facing_collection, "paused");
assert.equal(report.evidence.production_stripe_key_mode, "live");
assert.equal(report.evidence.unsigned_webhook_response, "REAL_PAYMENTS_PAUSED");
assert.equal(report.stripe_live_account.revolut_default_attached, true);
assert.equal(report.stripe_live_account.bank_verified, false);
assert.ok(report.blockers.some((b) => /Marketplace Stripe Checkout/i.test(b)));
assert.ok(report.blockers.some((b) => /uncollected/i.test(b)));
assert.ok(
  report.blockers.some((b) => /checkout\.session\.completed/i.test(b))
);
console.log("STRIPE_LIVE_READINESS_TEST_OK");
