"use strict";

/*
 * Staging-only helper: create a Test Mode charge + payout so Stripe
 * can deliver a real sandbox-originated payout.paid to the registered
 * staging webhook. Never moves live money. Never logs secrets.
 */

const {
  stripeSecretMode,
  realPaymentsEnabled
} = require("./real-payments.cjs");
const {
  isPreviewRuntime,
  isStagingSupabase,
  createStripeClient
} = require("./stripe-runtime.cjs");

const CONFIRM_PHRASE = "sandbox_payout_paid_e2e";
const STAGING_WEBHOOK_ID = "we_1UawCfEAHNL6NCGlIEajIIcv";

function sandboxPayoutE2eAllowed(env = process.env) {
  if (!isPreviewRuntime(env) && !isStagingSupabase(env)) {
    return { ok: false, code: "NOT_STAGING", error: "Sandbox payout e2e is staging-only" };
  }
  if (realPaymentsEnabled(env)) {
    return { ok: false, code: "REAL_PAYMENTS_ON", error: "Refuse e2e while real payments enabled" };
  }
  if (env.HAVKAR_STRIPE_LIVE_ENABLED === "true") {
    return { ok: false, code: "LIVE_FLAG_ON", error: "Refuse e2e while Stripe live flag enabled" };
  }
  if (stripeSecretMode(env) !== "test") {
    return {
      ok: false,
      code: "SECRET_NOT_TEST",
      error: "STRIPE_SECRET_KEY must be sk_test on staging e2e"
    };
  }
  if (!isStagingSupabase(env)) {
    return {
      ok: false,
      code: "SUPABASE_NOT_STAGING",
      error: "Staging Supabase required for sandbox payout e2e"
    };
  }
  return { ok: true };
}

function parseConfirm(body) {
  if (!body || typeof body !== "object") return false;
  return String(body.confirm || "") === CONFIRM_PHRASE;
}

async function runSandboxPayoutPaidE2e(env = process.env) {
  const gate = sandboxPayoutE2eAllowed(env);
  if (!gate.ok) {
    return { ok: false, httpStatus: 403, ...gate };
  }

  const stripeRuntime = createStripeClient(env);
  if (!stripeRuntime.ok || !stripeRuntime.client) {
    return {
      ok: false,
      httpStatus: 503,
      code: "STRIPE_CLIENT",
      error: stripeRuntime.reason || "stripe_unavailable"
    };
  }
  const stripe = stripeRuntime.client;

  // Fund test balance with a confirmed card PaymentIntent (no real money).
  const intent = await stripe.paymentIntents.create({
    amount: 500,
    currency: "eur",
    confirm: true,
    payment_method: "pm_card_visa",
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata: {
      havkar_flow: "staging_sandbox_payout_e2e",
      havkar_env: "staging"
    }
  });

  if (intent.status !== "succeeded") {
    return {
      ok: false,
      httpStatus: 502,
      code: "FUNDING_NOT_SUCCEEDED",
      error: "Test Mode funding PaymentIntent did not succeed",
      payment_intent_id: intent.id,
      payment_intent_status: intent.status,
      livemode: false
    };
  }

  // Prefer EUR available balance; fall back to any positive available.
  const balance = await stripe.balance.retrieve();
  const available = Array.isArray(balance.available) ? balance.available : [];
  let source = available.find((b) => b.currency === "eur" && Number(b.amount) >= 100);
  if (!source) {
    source = available.find((b) => Number(b.amount) >= 100);
  }
  if (!source) {
    return {
      ok: false,
      httpStatus: 409,
      code: "INSUFFICIENT_TEST_BALANCE",
      error: "No available Test Mode balance for a 100-unit payout",
      payment_intent_id: intent.id,
      livemode: false
    };
  }

  const payoutAmount = Math.min(100, Number(source.amount));
  const payout = await stripe.payouts.create({
    amount: payoutAmount,
    currency: source.currency,
    metadata: {
      havkar_flow: "staging_sandbox_payout_e2e",
      havkar_env: "staging"
    }
  });

  return {
    ok: true,
    httpStatus: 200,
    livemode: false,
    secret_key_mode: "test",
    payment_intent_id: intent.id,
    payout_id: payout.id,
    payout_status: payout.status,
    payout_amount: payout.amount,
    payout_currency: payout.currency,
    expected_events: ["payout.created", "payout.paid"],
    webhook_destination_id: STAGING_WEBHOOK_ID,
    note: "Stripe should deliver signed sandbox events to staging webhook; poll ledger for payout.paid"
  };
}

module.exports = {
  CONFIRM_PHRASE,
  STAGING_WEBHOOK_ID,
  sandboxPayoutE2eAllowed,
  parseConfirm,
  runSandboxPayoutPaidE2e
};
