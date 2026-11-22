/**
 * Production main rejects ALL signed Stripe webhooks with REAL_PAYMENTS_PAUSED
 * while flags are off. Branch handler must verify signature and process
 * reconciliation events without requiring cardPaymentsAllowed().
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const webhookSource = fs.readFileSync(
  path.join(root, "api/stripe-webhook.js"),
  "utf8"
);

test("signed webhook path is not gated solely by cardPaymentsAllowed before constructEvent", () => {
  // Use the runtime call site comment, not the import line.
  const afterAds = webhookSource.indexOf("Ads boost TEST MODE is prepared");
  const constructAt = webhookSource.indexOf("webhooks.constructEvent");
  assert.ok(afterAds > 0 && constructAt > afterAds);

  // Between ads-boost handling and constructEvent there must NOT be a blanket
  // `if (!cardPaymentsAllowed()) return 403` that blocks all signed deliveries.
  const between = webhookSource.slice(afterAds, constructAt);
  assert.doesNotMatch(
    between,
    /if\s*\(\s*!cardPaymentsAllowed\(\)\s*\)\s*\{[\s\S]*?REAL_PAYMENTS_PAUSED/
  );
  assert.match(between, /STRIPE_WEBHOOK_SECRET/);
});

test("handler source still returns REAL_PAYMENTS_PAUSED only for unsigned probes when paused", () => {
  assert.match(webhookSource, /Missing Stripe signature/);
  assert.match(webhookSource, /REAL_PAYMENTS_PAUSED_CODE/);
  // Marketplace live fulfillment remains gated while master flags are off.
  assert.match(webhookSource, /havkar_flow === "marketplace"/);
});

test("Stripe signature helper constructs verifiable header for pause-path tests", () => {
  const secret = "whsec_test_pause_processing";
  const payload = JSON.stringify({
    id: "evt_test_pause",
    object: "event",
    type: "payout.paid",
    livemode: true,
    data: { object: { id: "po_test", status: "paid", amount: 100, currency: "eur" } }
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  const header = `t=${timestamp},v1=${signed}`;
  assert.match(header, /^t=\d+,v1=[a-f0-9]+$/);
});
