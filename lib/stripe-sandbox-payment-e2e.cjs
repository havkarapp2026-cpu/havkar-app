"use strict";

/*
 * Staging-only Stripe sandbox payment scenarios.
 * Uses Preview sk_test helpers only — never raw PANs, never Charges/tokens,
 * never live money. Webhook delivery depends on we_1UawCf… event list.
 */

const {
  sandboxPayoutE2eAllowed,
  parseConfirm,
  runSandboxPayoutPaidE2e,
  CONFIRM_PHRASE,
  STAGING_WEBHOOK_ID,
  EXPECTED_SANDBOX_ACCOUNT_ID
} = require("./stripe-sandbox-payout-e2e.cjs");
const { createStripeClient } = require("./stripe-runtime.cjs");

const SCENARIOS = Object.freeze({
  payout_paid: "payout_paid",
  payment_success: "payment_success",
  payment_fail: "payment_fail",
  refund: "refund"
});

function parseScenario(body) {
  const raw = String((body && body.scenario) || SCENARIOS.payout_paid).trim();
  if (!Object.prototype.hasOwnProperty.call(SCENARIOS, raw)) {
    return null;
  }
  return raw;
}

async function resolveSandboxStripe(env) {
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
  return { ok: true, stripe, accountId };
}

async function runPaymentSuccess(env) {
  const resolved = await resolveSandboxStripe(env);
  if (!resolved.ok) return resolved;
  const { stripe, accountId } = resolved;
  const intent = await stripe.paymentIntents.create({
    amount: 250,
    currency: "eur",
    confirm: true,
    payment_method: "pm_card_visa",
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata: {
      havkar_flow: "staging_sandbox_payment_success",
      havkar_env: "staging"
    }
  });
  return {
    ok: intent.status === "succeeded",
    httpStatus: intent.status === "succeeded" ? 200 : 502,
    scenario: SCENARIOS.payment_success,
    livemode: false,
    stripe_account_id: accountId,
    payment_intent_id: intent.id,
    payment_intent_status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
    webhook_destination_id: STAGING_WEBHOOK_ID,
    note:
      "Genuine sandbox PaymentIntent via pm_card_visa. Webhook delivery only if endpoint listens for payment_intent.*"
  };
}

async function runPaymentFail(env) {
  const resolved = await resolveSandboxStripe(env);
  if (!resolved.ok) return resolved;
  const { stripe, accountId } = resolved;
  try {
    const intent = await stripe.paymentIntents.create({
      amount: 250,
      currency: "eur",
      confirm: true,
      payment_method: "pm_card_chargeDeclined",
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: {
        havkar_flow: "staging_sandbox_payment_fail",
        havkar_env: "staging"
      }
    });
    return {
      ok: false,
      httpStatus: 502,
      code: "EXPECTED_DECLINE_MISSING",
      scenario: SCENARIOS.payment_fail,
      livemode: false,
      stripe_account_id: accountId,
      payment_intent_id: intent.id,
      payment_intent_status: intent.status,
      error: "Expected decline but PaymentIntent did not fail"
    };
  } catch (err) {
    const code = err && err.code ? String(err.code) : "";
    const declined =
      code === "card_declined" ||
      /declined|insufficient|card_error/i.test(String(err && err.message));
    return {
      ok: declined,
      httpStatus: declined ? 200 : 502,
      scenario: SCENARIOS.payment_fail,
      livemode: false,
      stripe_account_id: accountId,
      stripe_error_code: code || null,
      stripe_error_type: err && err.type ? String(err.type) : null,
      expected: "card_declined",
      webhook_destination_id: STAGING_WEBHOOK_ID,
      note: "Genuine sandbox decline via pm_card_chargeDeclined (no raw PAN)"
    };
  }
}

async function runRefund(env) {
  const resolved = await resolveSandboxStripe(env);
  if (!resolved.ok) return resolved;
  const { stripe, accountId } = resolved;
  const intent = await stripe.paymentIntents.create({
    amount: 300,
    currency: "eur",
    confirm: true,
    payment_method: "pm_card_visa",
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata: {
      havkar_flow: "staging_sandbox_refund",
      havkar_env: "staging"
    }
  });
  if (intent.status !== "succeeded") {
    return {
      ok: false,
      httpStatus: 502,
      code: "REFUND_FUNDING_FAILED",
      scenario: SCENARIOS.refund,
      livemode: false,
      stripe_account_id: accountId,
      payment_intent_id: intent.id,
      payment_intent_status: intent.status
    };
  }
  const refund = await stripe.refunds.create({
    payment_intent: intent.id,
    metadata: {
      havkar_flow: "staging_sandbox_refund",
      havkar_env: "staging"
    }
  });
  return {
    ok: refund.status === "succeeded" || refund.status === "pending",
    httpStatus:
      refund.status === "succeeded" || refund.status === "pending" ? 200 : 502,
    scenario: SCENARIOS.refund,
    livemode: false,
    stripe_account_id: accountId,
    payment_intent_id: intent.id,
    refund_id: refund.id,
    refund_status: refund.status,
    refund_amount: refund.amount,
    currency: refund.currency,
    webhook_destination_id: STAGING_WEBHOOK_ID,
    note:
      "Genuine sandbox refund. charge.refunded webhook requires endpoint event subscription."
  };
}

async function runSandboxPaymentScenario(env, body) {
  if (!parseConfirm(body)) {
    return {
      ok: false,
      httpStatus: 400,
      code: "CONFIRM_REQUIRED",
      error: "confirm phrase required for staging sandbox payment e2e"
    };
  }
  const scenario = parseScenario(body);
  if (!scenario) {
    return {
      ok: false,
      httpStatus: 400,
      code: "SCENARIO_INVALID",
      error: "scenario must be payout_paid|payment_success|payment_fail|refund",
      allowed: Object.keys(SCENARIOS)
    };
  }
  if (scenario === SCENARIOS.payout_paid) {
    const result = await runSandboxPayoutPaidE2e(env);
    return { ...result, scenario };
  }
  if (scenario === SCENARIOS.payment_success) {
    return runPaymentSuccess(env);
  }
  if (scenario === SCENARIOS.payment_fail) {
    return runPaymentFail(env);
  }
  return runRefund(env);
}

module.exports = {
  SCENARIOS,
  CONFIRM_PHRASE,
  STAGING_WEBHOOK_ID,
  EXPECTED_SANDBOX_ACCOUNT_ID,
  parseConfirm,
  parseScenario,
  runSandboxPaymentScenario
};
