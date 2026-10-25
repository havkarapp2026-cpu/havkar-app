/*
 * Owner switch for real money movement.
 * Absent or any value other than the exact string "true" means paused.
 * Stellar Testnet checkout does not use this switch.
 * Stripe live keys stay refused unless HAVKAR_STRIPE_LIVE_ENABLED is also
 * the exact string "true". Neither flag is set by this change.
 */

export function realPaymentsEnabled(env = process.env) {
  return env?.HAVKAR_REAL_PAYMENTS_ENABLED === "true";
}

export function cardPaymentsAllowed(env = process.env) {
  if (!realPaymentsEnabled(env)) {
    return false;
  }

  const key = String(env?.STRIPE_SECRET_KEY || "");

  if (key.startsWith("sk_live_") && env?.HAVKAR_STRIPE_LIVE_ENABLED !== "true") {
    return false;
  }

  return true;
}

export const REAL_PAYMENTS_PAUSED_CODE = "REAL_PAYMENTS_PAUSED";

export const REAL_PAYMENTS_PAUSED_MESSAGE =
  "Real payments are paused until the owner enables them.";
