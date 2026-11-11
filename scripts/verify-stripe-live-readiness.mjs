#!/usr/bin/env node
/**
 * Stripe live readiness verifier (read-only).
 * Does not enable flags, create charges, print secrets, or change payout banks.
 * Always keeps live_activation_allowed=false until Owner explicitly arms flags
 * after reviewing the production-readiness report.
 */
import assert from "node:assert/strict";
import {
  cardPaymentsAllowed,
  realPaymentsEnabled,
  stripeSecretMode
} from "../lib/real-payments.cjs";

const base = process.env.HAVKAR_APP_URL || "https://havkar-app.vercel.app";
const LIVE_ACCOUNT_ID = "acct_1UJwZZECWiUpELSP";

async function main() {
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
  const payout = status.stripe?.payout_bank?.default_eur || null;
  const bankVerified = payout && String(payout.status) === "verified";
  const revolutDefault =
    payout &&
    /REVOLUT/i.test(String(payout.bank_name || "")) &&
    payout.default_for_currency === true &&
    String(payout.last4) === "8455";

  const blockers = [];

  if (keyMode !== "live") {
    blockers.push(
      "Production STRIPE_SECRET_KEY mode must be live (currently " +
        JSON.stringify(keyMode) +
        ")."
    );
  }
  if (!revolutDefault) {
    blockers.push(
      "Default EUR payout bank must be Revolut …8455 (probe missing or not default)."
    );
  }
  if (!bankVerified) {
    blockers.push(
      "Revolut payout bank status is not verified yet (observed status=" +
        JSON.stringify(payout?.status || null) +
        "). Daily schedule does not equal verified settlement."
    );
  }
  if (!liveFlagOn) {
    blockers.push("HAVKAR_STRIPE_LIVE_ENABLED is not true on Production.");
  }
  if (!masterOn) {
    blockers.push("HAVKAR_REAL_PAYMENTS_ENABLED is not true on Production.");
  }
  blockers.push(
    "Marketplace Stripe Checkout + Connect seller payouts are not implemented."
  );
  blockers.push(
    "Services 10% commissions remain ledger liabilities (uncollected); not Stripe cash."
  );
  blockers.push(
    "Live webhook currently subscribes only checkout.session.completed — expand refund/dispute/payout events before claiming automated settlement."
  );
  blockers.push(
    "No irreversible live charge without separate exact-amount owner confirmation."
  );

  if (collection !== "paused" && (!masterOn || !liveFlagOn || keyMode !== "live")) {
    blockers.push("Collection is not paused while activation prerequisites are incomplete.");
  }

  const liveActivationAllowed = false;
  const report = {
    ok: true,
    generated_at: new Date().toISOString(),
    stripe_live_account: {
      account_id: LIVE_ACCOUNT_ID,
      production_key_mode: keyMode,
      charges_enabled_probed:
        status.stripe?.payout_bank?.charges_enabled ?? null,
      payouts_enabled_probed:
        status.stripe?.payout_bank?.payouts_enabled ?? null,
      default_eur_bank: payout
        ? {
            bank_name: payout.bank_name,
            last4: payout.last4,
            country: payout.country,
            currency: payout.currency,
            default_for_currency: payout.default_for_currency,
            status: payout.status
          }
        : null,
      revolut_default_attached: Boolean(revolutDefault),
      bank_verified: Boolean(bankVerified),
      note:
        "Payout schedule/daily interval is Owner Dashboard state; this script does not mutate Stripe."
    },
    stripe_live_activation: "BLOCKED",
    live_activation_allowed: liveActivationAllowed,
    recommendation: "NO-GO",
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
      local_cards_allowed: localArmed,
      production_blockers: status.blockers || []
    },
    blockers,
    required_owner_action:
      "Keep collection paused. After Revolut bank status=verified, webhook event expansion, legal checklist, and an exact micro-charge amount, Owner may set HAVKAR_STRIPE_LIVE_ENABLED=true then HAVKAR_REAL_PAYMENTS_ENABLED=true. Do not treat daily payout schedule as immediate settlement. Do not claim Connect marketplace payouts until implemented."
  };

  assert.equal(report.live_activation_allowed, false);
  assert.equal(collection, "paused");
  assert.equal(webhook.code, "REAL_PAYMENTS_PAUSED");
  assert.equal(keyMode, "live");
  assert.ok(blockers.length >= 4);

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
