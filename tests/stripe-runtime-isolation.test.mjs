import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import {
  createStripeClient,
  stagingIsolationFailure,
  isStagingSupabase,
  CONFIG_ERROR_CODE
} from "../lib/stripe-runtime.cjs";

const require = createRequire(import.meta.url);
const Stripe = require("stripe");

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const webhookSource = fs.readFileSync(
  path.join(root, "api/stripe-webhook.js"),
  "utf8"
);

test("webhook no longer constructs Stripe at module load", () => {
  assert.doesNotMatch(
    webhookSource,
    /const stripe = new Stripe\(process\.env\.STRIPE_SECRET_KEY\);/
  );
  assert.match(webhookSource, /createStripeClient/);
  assert.match(webhookSource, /configErrorResponse/);
  assert.match(webhookSource, /LIVE_EVENT_REFUSED_ON_STAGING/);
});

test("staging isolation refuses live Stripe secrets on preview", () => {
  const failure = stagingIsolationFailure({
    VERCEL_ENV: "preview",
    STRIPE_SECRET_KEY: "sk_live_not_real",
    SUPABASE_URL: "https://keglioewbkgdabsizvys.supabase.co"
  });
  assert.ok(failure);
  assert.equal(failure.code, CONFIG_ERROR_CODE);
  assert.equal(failure.secret_key_mode, "live");
});

test("staging isolation refuses Production Supabase on preview", () => {
  const failure = stagingIsolationFailure({
    VERCEL_ENV: "preview",
    STRIPE_SECRET_KEY: "sk_test_not_real",
    SUPABASE_URL: "https://gispovnciifgikvgpzck.supabase.co"
  });
  assert.ok(failure);
  assert.equal(failure.supabase_target, "production");
});

test("createStripeClient fails closed when key missing", () => {
  const result = createStripeClient({ STRIPE_SECRET_KEY: "" });
  assert.equal(result.ok, false);
  assert.equal(result.mode, "missing");
  assert.equal(result.client, null);
});

test("createStripeClient accepts sk_test on staging URL", () => {
  const result = createStripeClient({
    VERCEL_ENV: "preview",
    STRIPE_SECRET_KEY: "sk_test_not_a_real_key_for_unit",
    SUPABASE_URL: "https://keglioewbkgdabsizvys.supabase.co"
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "test");
  assert.ok(result.client);
});

test("isStagingSupabase detects staging host", () => {
  assert.equal(
    isStagingSupabase({
      SUPABASE_URL: "https://keglioewbkgdabsizvys.supabase.co"
    }),
    true
  );
  assert.equal(
    isStagingSupabase({
      SUPABASE_URL: "https://gispovnciifgikvgpzck.supabase.co"
    }),
    false
  );
});

test("constructEvent rejects invalid signature with test secret", () => {
  const stripe = new Stripe("sk_test_unit_isolation");
  const payload = JSON.stringify({
    id: "evt_unit_invalid_sig",
    object: "event",
    type: "payout.paid",
    livemode: false,
    data: { object: { id: "po_unit" } }
  });
  assert.throws(() => {
    stripe.webhooks.constructEvent(
      payload,
      "t=1,v1=deadbeef",
      "whsec_unit_test_secret"
    );
  });
});

test("constructEvent accepts valid test signature", () => {
  const stripe = new Stripe("sk_test_unit_isolation");
  const secret = "whsec_unit_valid_sig";
  const payload = JSON.stringify({
    id: "evt_unit_valid_sig",
    object: "event",
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: "cs_test_unit",
        metadata: { test_mode: "true", havkar_flow: "events" }
      }
    }
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  const header = `t=${timestamp},v1=${signed}`;
  const event = stripe.webhooks.constructEvent(payload, header, secret);
  assert.equal(event.id, "evt_unit_valid_sig");
  assert.equal(event.livemode, false);
});
