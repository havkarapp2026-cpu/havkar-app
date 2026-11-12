/*
 * Owner switches for real money movement.
 * Absent or any value other than the exact string "true" means paused.
 * Stellar Testnet checkout does not use these switches.
 * Stripe live-mode secrets stay refused unless HAVKAR_STRIPE_LIVE_ENABLED
 * is also the exact string "true".
 *
 * Per-provider flags keep incomplete rails off without blocking ready ones:
 * - HAVKAR_STRIPE_PAYMENTS_ENABLED (default true once master is on)
 * - HAVKAR_PI_PAYMENTS_ENABLED (default false)
 * - HAVKAR_TRADE_ENABLED (default false)
 *
 * This file is CommonJS because Vercel compiles the API routes to CommonJS
 * and then loads this helper with require(). An ESM .mjs file crashes those
 * routes before the pause can answer.
 */

function realPaymentsEnabled(env = process.env) {
  return env?.HAVKAR_REAL_PAYMENTS_ENABLED === "true";
}

function flagEnabled(env, name, defaultWhenMasterOn) {
  const raw = env?.[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return Boolean(defaultWhenMasterOn);
  }
  return raw === "true";
}

function stripeSecretMode(env = process.env) {
  // Never log the key. Trim wrapping quotes/whitespace that break mode detection.
  const key = String(env?.STRIPE_SECRET_KEY || "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!key) return "missing";
  if (/^sk_live(?:_|\b)/.test(key) || /^rk_live(?:_|\b)/.test(key)) return "live";
  if (/^sk_test(?:_|\b)/.test(key) || /^rk_test(?:_|\b)/.test(key)) return "test";
  // Publishable keys must never be used as the server secret.
  if (/^pk_(?:live|test)(?:_|\b)/.test(key)) return "publishable_misconfigured";
  return "unknown";
}

function cardPaymentsAllowed(env = process.env) {
  if (!realPaymentsEnabled(env)) {
    return false;
  }

  if (!flagEnabled(env, "HAVKAR_STRIPE_PAYMENTS_ENABLED", true)) {
    return false;
  }

  const mode = stripeSecretMode(env);
  if (mode === "live" && env?.HAVKAR_STRIPE_LIVE_ENABLED !== "true") {
    return false;
  }

  return true;
}

function piPaymentsAllowed(env = process.env) {
  return realPaymentsEnabled(env) && flagEnabled(env, "HAVKAR_PI_PAYMENTS_ENABLED", false);
}

function tradePaymentsAllowed(env = process.env) {
  return realPaymentsEnabled(env) && flagEnabled(env, "HAVKAR_TRADE_ENABLED", false);
}

/**
 * Non-production Stripe Test Mode checkout (sk_test / rk_test only).
 * Never enables live collection. Production live keys cannot use this path.
 */
function stripeTestCheckoutAllowed(env = process.env) {
  if (env?.HAVKAR_STRIPE_TEST_CHECKOUT_ENABLED !== "true") {
    return false;
  }
  return stripeSecretMode(env) === "test";
}

const REAL_PAYMENTS_PAUSED_CODE = "REAL_PAYMENTS_PAUSED";

const REAL_PAYMENTS_PAUSED_MESSAGE =
  "Real payments are paused until the owner enables them.";

module.exports = {
  realPaymentsEnabled,
  cardPaymentsAllowed,
  piPaymentsAllowed,
  tradePaymentsAllowed,
  stripeTestCheckoutAllowed,
  stripeSecretMode,
  REAL_PAYMENTS_PAUSED_CODE,
  REAL_PAYMENTS_PAUSED_MESSAGE
};
