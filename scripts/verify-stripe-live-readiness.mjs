#!/usr/bin/env node
/**
 * Stripe live readiness verifier.
 * Does not enable flags, create charges, or print secrets.
 * Exit 0 = report printed. Live activation stays blocked until every required
 * check is green; this script never flips production flags.
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
const auditPath = path.join(root, "store/STRIPE_ACCOUNT_AUDIT_20261108.md");

function required(fileText, needle, label) {
  assert.ok(fileText.includes(needle), label);
}

async function main() {
  const audit = fs.readFileSync(auditPath, "utf8");
  required(audit, "livemode=false", "audit must record sandbox-only MCP");
  required(audit, "Live-mode Stripe account was not present", "audit must block false live claims");
  required(audit, "access.stripe.com/mcp/oauth2/authorize", "audit must include live connect URL");

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

  const liveActivationAllowed = false;
  const report = {
    ok: true,
    generated_at: new Date().toISOString(),
    stripe_live_activation: "BLOCKED",
    live_activation_allowed: liveActivationAllowed,
    evidence: {
      mcp_accounts: "sandbox_only_HAVKAR-sandlada",
      mcp_livemode: false,
      production_customer_facing_collection: status.customer_facing_collection,
      production_master_flag: status.flags?.HAVKAR_REAL_PAYMENTS_ENABLED === true,
      production_live_flag: status.flags?.HAVKAR_STRIPE_LIVE_ENABLED === true,
      production_stripe_key_mode:
        status.providers?.stripe?.secret_key_mode ||
        status.stripe?.secret_key_mode ||
        null,
      production_webhook_secret_configured:
        status.providers?.stripe?.webhook_secret_configured ??
        status.stripe?.webhook_secret_configured ??
        null,
      unsigned_webhook_response: webhook.code || webhook.error || null,
      local_process_env_secret_mode: localMode,
      local_master_enabled: localMaster,
      local_cards_allowed: localArmed
    },
    required_owner_action:
      "Authorize the LIVE Stripe account named HAVKAR (not HAVKAR-sandlåda) via the MCP reconsent URL in store/STRIPE_ACCOUNT_AUDIT_20261108.md, then re-run this script.",
    hard_rules: [
      "Do not set HAVKAR_REAL_PAYMENTS_ENABLED=true until live MCP eligibility is verified.",
      "Do not create real charges without a separate exact-amount owner confirmation.",
      "Keep Pi, Trade, and Stellar Mainnet individually disabled."
    ]
  };

  assert.equal(report.live_activation_allowed, false);
  assert.equal(status.customer_facing_collection, "paused");
  assert.equal(webhook.code, "REAL_PAYMENTS_PAUSED");

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
