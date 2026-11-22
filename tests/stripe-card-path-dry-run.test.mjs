/**
 * End-to-end dry run against Production without charging cards.
 * Accepts Owner-armed OR paused collection. Never opens Checkout.
 */
import assert from "node:assert/strict";

const base = process.env.HAVKAR_PROD_BASE || "https://havkar.online";

const statusRes = await fetch(`${base}/api/payment-activation-status`, {
  method: "GET"
});
assert.equal(statusRes.status, 200);
const status = await statusRes.json();
assert.equal(status.ok, true);
assert.ok(
  status.customer_facing_collection === "paused" ||
    status.customer_facing_collection === "armed"
);
assert.equal(status.stripe.secret_key_mode, "live");
assert.ok(
  status.stellar_mainnet_collection === "armed" ||
    status.stellar_mainnet_collection === "paused"
);

const payout = status.stripe.payout_bank?.default_eur || null;
if (payout) {
  assert.equal(payout.last4, "8455");
  assert.match(String(payout.bank_name), /REVOLUT/i);
  assert.equal(payout.default_for_currency, true);
}

const checkoutRes = await fetch(`${base}/api/create-event-checkout`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ event_id: 1, quantity: 1, ticket_type: "general" })
});
// Unauthenticated callers must not reach Stripe Checkout.
assert.ok([401, 403, 405].includes(checkoutRes.status) || checkoutRes.status >= 400);
const checkoutBody = await checkoutRes.json().catch(() => ({}));
assert.doesNotMatch(JSON.stringify(checkoutBody), /checkout\.stripe\.com/);
assert.doesNotMatch(JSON.stringify(checkoutBody), /sk_live_|rk_live_/);

const webhookRes = await fetch(`${base}/api/stripe-webhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}"
});
assert.ok([400, 403].includes(webhookRes.status));
const webhookBody = await webhookRes.json();
const webhookCode = String(webhookBody.code || webhookBody.error || "");
assert.match(webhookCode, /REAL_PAYMENTS_PAUSED|Missing Stripe signature/i);

console.log("STRIPE_CARD_PATH_DRY_RUN_OK");
