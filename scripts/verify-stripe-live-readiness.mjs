#!/usr/bin/env node
/**
 * Stripe live readiness verifier (read-only).
 * Does not enable flags, create charges, print secrets, or change payout banks.
 */
import assert from "node:assert/strict";
import {
  cardPaymentsAllowed,
  realPaymentsEnabled,
  stripeSecretMode
} from "../lib/real-payments.cjs";
import {
  describeExternalBankPayoutReadiness,
  isBlockingExternalBankStatus
} from "../lib/stripe-bank-status.cjs";
import { REQUIRED_WEBHOOK_EVENTS } from "../lib/stripe-webhook-processor.cjs";

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
  const revolutDefault =
    payout &&
    /REVOLUT/i.test(String(payout.bank_name || "")) &&
    payout.default_for_currency === true &&
    String(payout.last4) === "8455";

  const bankReadiness = describeExternalBankPayoutReadiness(
    {
      status: payout?.status,
      available_payout_methods: ["standard"]
    },
    {
      payouts_enabled: status.stripe?.payout_bank?.payouts_enabled === true,
      charges_enabled: status.stripe?.payout_bank?.charges_enabled === true
    }
  );

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
  if (isBlockingExternalBankStatus(payout?.status)) {
    blockers.push(
      "Revolut external account status blocks payouts (" +
        JSON.stringify(payout?.status) +
        ")."
    );
  }
  if (!bankReadiness.payouts_enabled) {
    blockers.push("Stripe payouts_enabled is false.");
  }
  if (!liveFlagOn) {
    blockers.push("HAVKAR_STRIPE_LIVE_ENABLED is not true on Production.");
  }
  if (!masterOn) {
    blockers.push("HAVKAR_REAL_PAYMENTS_ENABLED is not true on Production.");
  }
  blockers.push(
    "Merge payment webhook processor branch before arming flags: Production main still returns REAL_PAYMENTS_PAUSED for signed Stripe deliveries while paused."
  );
  blockers.push(
    "Live Dashboard webhook subscriptions must equal REQUIRED_WEBHOOK_EVENTS (" +
      REQUIRED_WEBHOOK_EVENTS.length +
      " events). Re-verify in Stripe Dashboard / MCP before arming."
  );
  blockers.push(
    "No irreversible live charge without separate exact-amount owner confirmation."
  );

  if (collection !== "paused" && (!masterOn || !liveFlagOn || keyMode !== "live")) {
    blockers.push(
      "Collection is not paused while activation prerequisites are incomplete."
    );
  }

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
      bank_status_new_is_blocker: false,
      bank_payout_readiness: bankReadiness,
      note:
        "Stripe docs: external account status=new means no validation activity yet; blocking statuses are errored / verification_failed / tokenized_account_number_deactivated."
    },
    stripe_live_activation: "BLOCKED",
    live_activation_allowed: false,
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
      "Keep collection paused until (1) this webhook-processor branch is on Production, (2) live webhook enabled_events match REQUIRED_WEBHOOK_EVENTS, (3) Test Mode e2e PASS, (4) Owner exact-amount confirmation. Then set HAVKAR_STRIPE_LIVE_ENABLED=true and HAVKAR_REAL_PAYMENTS_ENABLED=true on Vercel Production and redeploy. Do not bypass gates."
  };

  assert.equal(report.live_activation_allowed, false);
  assert.equal(collection, "paused");
  assert.equal(webhook.code, "REAL_PAYMENTS_PAUSED");
  assert.equal(keyMode, "live");
  assert.equal(report.stripe_live_account.bank_status_new_is_blocker, false);
  assert.ok(blockers.length >= 3);

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
