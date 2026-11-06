import assert from "node:assert/strict";
import fs from "node:fs";
import {
  logoEntitlementDecision,
  paidAiServicesEnabled,
  playReviewEntitlement,
  subscriptionCheckoutStatus
} from "../supabase/functions/havkar-ai-assistant/policy.mjs";

const reviewEmail = "amirjalilnia01@gmail.com";
const imageRequest = { mode: "image", task: "logo", logo: { name: "HAVKAR" } };
const confirmed = {
  email: reviewEmail,
  email_confirmed_at: "2026-11-01T00:00:00.000Z",
  app_metadata: {}
};

const allowed = playReviewEntitlement(confirmed);
assert.equal(allowed.allowed, true);
assert.equal(allowed.plan, "business");
assert.equal(allowed.admin, false);
assert.equal(allowed.payments, false);
assert.equal(allowed.source, "play_review");
assert.equal(playReviewEntitlement({
  email: "  AmirJalilnia01@Gmail.com  ",
  email_confirmed_at: "2026-11-01T00:00:00.000Z"
}).allowed, true);

assert.equal(playReviewEntitlement({
  email: reviewEmail
}).allowed, false);
assert.equal(playReviewEntitlement({
  email: reviewEmail,
  email_confirmed_at: "",
  user_metadata: { email: reviewEmail, role: "admin" }
}).allowed, false);
assert.equal(playReviewEntitlement({
  email: "amirjalilnia01+review@gmail.com",
  email_confirmed_at: "2026-11-01T00:00:00.000Z"
}).allowed, false);
assert.equal(playReviewEntitlement({
  email: "other@havkar.online",
  email_confirmed_at: "2026-11-01T00:00:00.000Z",
  app_metadata: { play_review: true }
}).allowed, false);
assert.equal(playReviewEntitlement({
  email: reviewEmail,
  email_confirmed_at: "2026-11-01T00:00:00.000Z",
  app_metadata: { role: "admin" }
}).allowed, false);
assert.equal(playReviewEntitlement(null).allowed, false);

assert.equal(
  logoEntitlementDecision({ review: true }, imageRequest).allowed,
  true
);
assert.equal(
  logoEntitlementDecision({ review: true }, { messages: [{ role: "user", content: "Hello" }] }).required,
  false
);
assert.equal(paidAiServicesEnabled({}), false);
assert.equal(subscriptionCheckoutStatus({}).status, 403);

const source = fs.readFileSync("supabase/functions/havkar-ai-assistant/index.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261106143000_play_review_entitlement.sql", "utf8");
const payments = fs.readFileSync("lib/real-payments.cjs", "utf8");

assert.match(source, /playReviewEntitlement\(userResult\.data\.user\)/);
assert.match(source, /Paid image generation is paused\./);
assert.doesNotMatch(source, /auth\.admin\.updateUserById/);
assert.doesNotMatch(source, /role:\s*"admin"/);
assert.match(migration, /amirjalilnia01@gmail\.com/);
assert.match(migration, /email_confirmed_at IS NOT NULL/);
assert.match(migration, /raw_app_meta_data ->> 'role'/);
assert.match(migration, /COALESCE\(v_status, ''\)/);
assert.match(migration, /COALESCE\(v_plan, ''\)/);
assert.doesNotMatch(migration, /stripe_customer_id|stripe_subscription_id|HAVKAR_REAL_PAYMENTS_ENABLED/);
assert.doesNotMatch(migration, /UPDATE auth\.users|role\s*=\s*'admin'/i);
assert.match(payments, /HAVKAR_REAL_PAYMENTS_ENABLED === "true"/);

console.log("PLAY_REVIEW_ENTITLEMENT_TEST_OK");
