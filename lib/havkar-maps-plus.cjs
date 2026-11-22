/**
 * HAVKAR Maps Plus — future subscription scaffold.
 * Sales, charging, and auto-renew stay fully disabled until Owner arms them.
 */

const MAPS_PLUS = Object.freeze({
  product_id: "havkar_maps_plus",
  display_name: "HAVKAR Maps Plus",
  currency: "EUR",
  price_monthly: 4.99,
  trial_days: 30,
  sales_enabled: false,
  billing_enabled: false,
  auto_renew_enabled: false,
  checkout_enabled: false,
  free_tier_note:
    "All currently active map features on Tickets and Accommodation remain free for every user.",
  honesty:
    "Maps Plus is designed for a future optional upgrade. No payment is collected, no trial starts automatically, and no features are locked behind a paywall today."
});

function mapsPlusStatus() {
  return {
    ok: true,
    product: MAPS_PLUS,
    armed: false,
    user_chargeable: false,
    message:
      "HAVKAR Maps Plus planned at €4.99/month with 30-day free trial — sales and auto-renew are OFF."
  };
}

module.exports = {
  MAPS_PLUS,
  mapsPlusStatus
};
