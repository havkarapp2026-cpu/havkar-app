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
const EXPECTED_SANDBOX_ACCOUNT_ID = "acct_1UJwZzEAHNL6NCGl";

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

  // Ensure Preview sk_test belongs to the same sandbox as we_1UawCf….
  let accountId = "";
  try {
    const account = await stripe.accounts.retrieve();
    accountId = String((account && account.id) || "");
  } catch (_err) {
    accountId = "";
  }
  if (!accountId) {
    return {
      ok: false,
      httpStatus: 503,
      code: "STRIPE_ACCOUNT_UNREADABLE",
      error: "Could not resolve Stripe account id for Preview STRIPE_SECRET_KEY",
      expected_sandbox_account_id: EXPECTED_SANDBOX_ACCOUNT_ID,
      webhook_destination_id: STAGING_WEBHOOK_ID,
      livemode: false
    };
  }
  if (accountId !== EXPECTED_SANDBOX_ACCOUNT_ID) {
    return {
      ok: false,
      httpStatus: 409,
      code: "STRIPE_ACCOUNT_MISMATCH",
      error:
        "Preview STRIPE_SECRET_KEY account does not match staging sandbox webhook account",
      stripe_account_id: accountId,
      expected_sandbox_account_id: EXPECTED_SANDBOX_ACCOUNT_ID,
      webhook_destination_id: STAGING_WEBHOOK_ID,
      livemode: false
    };
  }

  // Fund available Test Mode balance immediately (no real money).
  // pm_card_bypassPending* skips pending→available so payout.paid can fire.
  let fundingId = "";
  try {
    const intent = await stripe.paymentIntents.create({
      amount: 500,
      currency: "eur",
      confirm: true,
      payment_method: "pm_card_bypassPendingInternational",
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: {
        havkar_flow: "staging_sandbox_payout_e2e",
        havkar_env: "staging"
      }
    });
    fundingId = String(intent.id || "");
    if (intent.status !== "succeeded") {
      return {
        ok: false,
        httpStatus: 502,
        code: "FUNDING_NOT_SUCCEEDED",
        error: "Test Mode available-balance PaymentIntent did not succeed",
        payment_intent_id: fundingId || null,
        payment_intent_status: String(intent.status || ""),
        stripe_account_id: accountId || null,
        livemode: false
      };
    }
  } catch (fundErr) {
    return {
      ok: false,
      httpStatus: 502,
      code: "FUNDING_FAILED",
      error: "Test Mode available-balance funding failed",
      funding_error:
        fundErr && fundErr.message ? String(fundErr.message).slice(0, 180) : "unknown",
      stripe_account_id: accountId || null,
      livemode: false
    };
  }

  // Poll briefly for available balance after bypassPending funding.
  let source = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const balance = await stripe.balance.retrieve();
    const available = Array.isArray(balance.available) ? balance.available : [];
    source = available.find((b) => b.currency === "eur" && Number(b.amount) >= 100);
    if (!source) {
      source = available.find((b) => Number(b.amount) >= 100);
    }
    if (source) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (!source) {
    return {
      ok: false,
      httpStatus: 409,
      code: "INSUFFICIENT_TEST_BALANCE",
      error: "No available Test Mode balance for a 100-unit payout",
      payment_intent_id: fundingId || null,
      stripe_account_id: accountId || null,
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
    stripe_account_id: accountId || null,
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
  EXPECTED_SANDBOX_ACCOUNT_ID,
  sandboxPayoutE2eAllowed,
  parseConfirm,
  runSandboxPayoutPaidE2e
};
