import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  CONFIRM_PHRASE,
  sandboxPayoutE2eAllowed,
  parseConfirm
} = require("../lib/stripe-sandbox-payout-e2e.cjs");

test("parseConfirm accepts exact staging phrase only", () => {
  assert.equal(parseConfirm({ confirm: CONFIRM_PHRASE }), true);
  assert.equal(parseConfirm({ confirm: "nope" }), false);
  assert.equal(parseConfirm(null), false);
});

test("sandbox payout e2e refuses production-like env", () => {
  const denied = sandboxPayoutE2eAllowed({
    VERCEL_ENV: "production",
    SUPABASE_URL: "https://gispovnciifgikvgpzck.supabase.co",
    STRIPE_SECRET_KEY: "sk_test_x",
    HAVKAR_REAL_PAYMENTS_ENABLED: "false",
    HAVKAR_STRIPE_LIVE_ENABLED: "false"
  });
  assert.equal(denied.ok, false);
});

test("sandbox payout e2e refuses live secret even on preview", () => {
  const denied = sandboxPayoutE2eAllowed({
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "cursor/stripe-test-mode-staging-d4b2",
    SUPABASE_URL: "https://keglioewbkgdabsizvys.supabase.co",
    STRIPE_SECRET_KEY: "sk_live_x",
    HAVKAR_REAL_PAYMENTS_ENABLED: "false",
    HAVKAR_STRIPE_LIVE_ENABLED: "false"
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "SECRET_NOT_TEST");
});

test("sandbox payout e2e allows preview+staging+sk_test with locks off", () => {
  const allowed = sandboxPayoutE2eAllowed({
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "cursor/stripe-test-mode-staging-d4b2",
    SUPABASE_URL: "https://keglioewbkgdabsizvys.supabase.co",
    STRIPE_SECRET_KEY: "sk_test_x",
    HAVKAR_REAL_PAYMENTS_ENABLED: "false",
    HAVKAR_STRIPE_LIVE_ENABLED: "false"
  });
  assert.equal(allowed.ok, true);
});
