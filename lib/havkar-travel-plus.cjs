/**
 * HAVKAR Travel Plus — optional smart-travel subscription scaffold.
 * Separate from health provider subscriptions and from Maps Plus naming.
 * Sales, charging, auto-renew, and checkout stay OFF until Owner arms them.
 */

const TRAVEL_PLUS = Object.freeze({
  product_id: "havkar_travel_plus",
  display_name: "HAVKAR Travel Plus",
  currency: "EUR",
  price_monthly: 4.99,
  trial_days: 30,
  sales_enabled: false,
  billing_enabled: false,
  auto_renew_enabled: false,
  checkout_enabled: false,
  free_tier: [
    "Base map on Tickets and Accommodation",
    "TomTom place search and routing (evaluation quota)",
    "Mapillary / Embed Street View when keys exist",
    "Licensed cameras and Wikimedia photos when coverage exists",
    "Nearby POI lookup (pharmacy, hospital, transit, etc.)",
    "Multi-stop trip planner (local save)",
    "Patient health directory search"
  ],
  proposed_paid_value: [
    "Saved multi-device trip plans (requires authenticated sync — not armed)",
    "Deeper smart-guide digests with longer history (quota-gated)",
    "Priority routing refresh windows within TomTom contract limits",
    "Compare more stays with saved destination sets"
  ],
  honesty:
    "Travel Plus must add measurable smart value — never resell free third-party basemaps or Commons photos. Checkout and charging remain disabled."
});

function travelPlusStatus() {
  return {
    ok: true,
    product: TRAVEL_PLUS,
    armed: false,
    user_chargeable: false,
    sales_enabled: false,
    message:
      "HAVKAR Travel Plus proposed at €4.99/month with 30-day trial — sales, auto-renew, and checkout are OFF."
  };
}

module.exports = {
  TRAVEL_PLUS,
  travelPlusStatus
};
