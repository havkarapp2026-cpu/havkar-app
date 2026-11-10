/**
 * End-to-end dry run against Production without charging cards.
 * Confirms collection remains paused and Checkout is not opened.
 */
import assert from "node:assert/strict";

const base = process.env.HAVKAR_PROD_BASE || "https://havkar-app.vercel.app";

const statusRes = await fetch(`${base}/api/payment-activation-status`, {
  method: "GET"
});
assert.equal(statusRes.status, 200);
const status = await statusRes.json();
assert.equal(status.ok, true);
assert.equal(status.customer_facing_collection, "paused");
assert.equal(status.flags.HAVKAR_REAL_PAYMENTS_ENABLED, false);
assert.equal(status.flags.HAVKAR_STRIPE_LIVE_ENABLED, false);
assert.equal(status.stripe.secret_key_mode, "live");
assert.equal(status.stripe.live_collection_allowed, false);
assert.equal(status.stellar_mainnet_collection, "armed");

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
assert.equal(webhookRes.status, 403);
const webhookBody = await webhookRes.json();
assert.equal(webhookBody.code, "REAL_PAYMENTS_PAUSED");

console.log("STRIPE_CARD_PATH_DRY_RUN_OK");
