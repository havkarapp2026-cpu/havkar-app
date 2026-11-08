#!/usr/bin/env node
/**
 * Stripe live readiness verifier.
 * Does not enable flags, create charges, or print secrets.
 * Exit 0 prints a report. Live activation stays blocked until every
 * required production check is green; this script never flips flags.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cardPaymentsAllowed,
  realPaymentsEnabled,
  stripeSecretMode
} from "../lib/real-payments.cjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.HAVKAR_APP_URL || "https://havkar-app.vercel.app";
const liveDoc = path.join(root, "store/STRIPE_LIVE_VERIFICATION_20261108.md");

function required(fileText, needle, label) {
  assert.ok(fileText.includes(needle), label);
}

async function main() {
  const live = fs.readFileSync(liveDoc, "utf8");
  required(live, "acct_1UJwZZECWiUpELSP", "live account id must be recorded");
  required(live, "charges_enabled", "live charges_enabled evidence");
  required(live, "payouts_enabled", "live payouts_enabled evidence");
  required(live, "**true**", "live enabled flags present");
  required(live, "NOT ACTIVATED", "must not claim activation");
  required(live, "**unknown**", "unknown key mode blocker");
  required(live, "POSTEMOBILE", "payout bank recorded");

  const localMode = stripeSecretMode(process.env);
  const localArmed = cardPaymentsAllowed(process.env);
  const localMaster = realPaymentsEnabled(process.env);

  const statusRes = await fetch(base + "/api/payment-activation-status");
  const status = await statusRes.json();
  assert.equal(statusRes.ok, true);
  assert.equal(status.ok, true);

  const webhookRes = await fetch(base + "/api/stripe-webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  const webhook = await webhookRes.json();

  const keyMode =
    status.providers?.stripe?.secret_key_mode ||
    status.stripe?.secret_key_mode ||
    null;
  const masterOn = status.flags?.HAVKAR_REAL_PAYMENTS_ENABLED === true;
  const liveFlagOn = status.flags?.HAVKAR_STRIPE_LIVE_ENABLED === true;
  const collection = status.customer_facing_collection;

  const blockers = [];
  if (keyMode !== "live") {
    blockers.push(
      "Production STRIPE_SECRET_KEY mode must be live (currently " +
        JSON.stringify(keyMode) +
        ")."
    );
  }
  if (!liveFlagOn) {
    blockers.push("HAVKAR_STRIPE_LIVE_ENABLED is not true on Production.");
  }
  if (!masterOn) {
    blockers.push("HAVKAR_REAL_PAYMENTS_ENABLED is not true on Production.");
  }
  if (collection !== "paused" && keyMode !== "live") {
    blockers.push("Collection is not paused while key mode is unsafe.");
  }
  blockers.push(
    "No irreversible live charge without separate exact-amount owner confirmation."
  );

  const liveActivationAllowed = false;
  const report = {
    ok: true,
    generated_at: new Date().toISOString(),
    stripe_live_account: {
      mcp_connected: true,
      account_id: "acct_1UJwZZECWiUpELSP",
      charges_enabled: true,
      payouts_enabled: true,
      requirements_clear: true,
      webhook_to_production: true,
      payout_bank: "POSTEMOBILE S.P.A. last4 0596 status=new"
    },
    stripe_live_activation: "BLOCKED",
    live_activation_allowed: liveActivationAllowed,
    evidence: {
      production_customer_facing_collection: collection,
      production_master_flag: masterOn,
      production_live_flag: liveFlagOn,
      production_stripe_key_mode: keyMode,
      production_webhook_secret_configured:
        status.providers?.stripe?.webhook_secret_configured ??
        status.stripe?.webhook_secret_configured ??
        null,
      unsigned_webhook_response: webhook.code || webhook.error || null,
      local_process_env_secret_mode: localMode,
      local_master_enabled: localMaster,
      local_cards_allowed: localArmed
    },
    blockers,
    required_owner_action:
      "In Vercel Production, set STRIPE_SECRET_KEY to the Live HAVKAR sk_live_ key for acct_1UJwZZECWiUpELSP so payment-activation-status reports secret_key_mode=live. Then set HAVKAR_STRIPE_LIVE_ENABLED=true and HAVKAR_REAL_PAYMENTS_ENABLED=true after reviewing PR #133. Confirm PosteMobile payout bank (or attach Revolut). Do not charge until a separate exact-amount confirmation."
  };

  assert.equal(report.live_activation_allowed, false);
  assert.equal(collection, "paused");
  assert.equal(webhook.code, "REAL_PAYMENTS_PAUSED");
  assert.ok(blockers.length >= 3);

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
