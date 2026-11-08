#!/usr/bin/env node
/**
 * Verifies customer-facing production payment gates remain paused unless
 * explicitly armed. Does not invent credentials or execute Mainnet payments.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.HAVKAR_APP_URL || "https://havkar-app.vercel.app";

async function main() {
  const source = fs.readFileSync(
    path.join(root, "stellar-wallet-source.js"),
    "utf8"
  );
  assert.match(
    source,
    /const STELLAR_MAINNET_PAYMENTS_ENABLED\s*=\s*false/
  );

  const webhook = await fetch(base + "/api/stripe-webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  const webhookBody = await webhook.json();
  assert.equal(webhookBody.code, "REAL_PAYMENTS_PAUSED");

  const status = await fetch(base + "/api/payment-activation-status");
  const statusBody = await status.json();
  assert.equal(status.ok, true);
  assert.equal(statusBody.ok, true);
  assert.equal(statusBody.customer_facing_collection, "paused");
  assert.equal(statusBody.flags.HAVKAR_REAL_PAYMENTS_ENABLED, false);
  assert.equal(statusBody.stellar.mainnet_payments_enabled_in_source, false);
  assert.ok(Array.isArray(statusBody.blockers));
  assert.ok(statusBody.blockers.length > 0);

  const trade = await fetch(base + "/api/trade-crypto", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  const tradeBody = await trade.json();
  assert.equal(tradeBody.ok, false);

  console.log(
    JSON.stringify(
      {
        ok: true,
        base,
        stripe_webhook: webhookBody.code,
        activation_status: statusBody.customer_facing_collection,
        stripe_key_mode: statusBody.stripe.secret_key_mode,
        blockers: statusBody.blockers
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
