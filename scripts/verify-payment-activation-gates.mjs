#!/usr/bin/env node
/**
 * Verifies production payment gates.
 * Does not invent credentials or execute Mainnet payments.
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
    /const STELLAR_MAINNET_PAYMENTS_ENABLED\s*=\s*true/
  );

  const mainnetHelper = fs.readFileSync(
    path.join(root, "lib/stellar-mainnet.cjs"),
    "utf8"
  );
  assert.match(mainnetHelper, /HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED/);
  assert.match(mainnetHelper, /HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION/);
  assert.match(mainnetHelper, /HAVKAR_STELLAR_MAINNET_DESTINATION/);
  assert.match(mainnetHelper, /stellarMainnetLiveCollectionEnabled/);

  const geoHelper = fs.readFileSync(
    path.join(root, "lib/crypto-geo-policy.cjs"),
    "utf8"
  );
  assert.match(geoHelper, /HAVKAR_CRYPTO_GEO_ENFORCEMENT/);
  assert.match(geoHelper, /CRYPTO_GEO_RESTRICTED/);
  assert.match(geoHelper, /x-vercel-ip-country/);

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
  assert.ok(Array.isArray(statusBody.blockers));
  assert.ok(statusBody.blockers.length > 0);

  // Until this PR is deployed + Owner sets Mainnet env, production may still
  // report source=false / mainnet_ready=false. Accept either pre- or post-deploy.
  if (statusBody.stellar && "mainnet_ready" in statusBody.stellar) {
    assert.equal(typeof statusBody.stellar.mainnet_ready, "boolean");
  }

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
        stellar_mainnet_collection: statusBody.stellar_mainnet_collection || null,
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
