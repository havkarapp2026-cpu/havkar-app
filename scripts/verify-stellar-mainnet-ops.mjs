#!/usr/bin/env node
/**
 * Production readiness probe for Stellar Mainnet.
 * Does not enable payments, invent destinations, or print secret values.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.HAVKAR_APP_URL || "https://havkar-app.vercel.app";

const source = fs.readFileSync(path.join(root, "stellar-wallet-source.js"), "utf8");
assert.match(source, /const STELLAR_MAINNET_PAYMENTS_ENABLED\s*=\s*true/);

const status = await fetch(base + "/api/payment-activation-status");
const body = await status.json();
assert.equal(status.ok, true);
assert.equal(body.ok, true);
assert.equal(body.stellar.mainnet_payments_enabled_in_source, true);
assert.equal(body.stellar.commissions.marketplace_buyer_bps, 200);
assert.equal(body.stellar.commissions.marketplace_seller_bps, 300);
assert.equal(body.stellar.commissions.services_provider_bps, 1000);
assert.ok(body.stellar.unsupported_flows.includes("subscription"));

const webhook = await fetch(base + "/api/stripe-webhook", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}"
});
const webhookBody = await webhook.json();
assert.equal(webhookBody.code, "REAL_PAYMENTS_PAUSED");

console.log(
  JSON.stringify(
    {
      ok: true,
      base,
      stellar_mainnet_collection: body.stellar_mainnet_collection,
      mainnet_ready: body.stellar.mainnet_ready,
      mainnet_flag: body.stellar.mainnet_flag,
      mainnet_destination_configured: body.stellar.mainnet_destination_configured,
      stripe_collection: body.customer_facing_collection,
      blockers: body.blockers
    },
    null,
    2
  )
);

if (body.stellar.mainnet_ready !== true) {
  process.exitCode = 2;
}
