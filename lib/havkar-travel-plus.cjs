/**
 * HAVKAR Travel Plus — optional smart-travel subscription scaffold.
 * Separate from health provider subscriptions and from Maps Plus naming.
 * Sales, charging, auto-renew, and checkout stay OFF until Owner arms them.
 * Personal GPS / My trips / memories / reminders remain FREE.
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
    "Personal GPS trip recording (with geo consent)",
    "My trips history, map replay, monthly/yearly stats",
    "Private travel memories / albums (cloud when signed in)",
    "Opt-in anniversary reminders (in-app; email when enabled)",
    "Licensed public cameras (LIVE vs JPEG honesty)",
    "133 display currencies + XLM rail status (payment only when legally/technically armed)",
    "Base map on Tickets and Accommodation",
    "TomTom place search and routing (evaluation quota)",
    "Offline IndexedDB queue for track points + sync when online"
  ],
  proposed_paid_value: [
    "Saved multi-device trip plans with longer cloud history (not armed)",
    "Deeper smart-guide digests with longer history (quota-gated)",
    "Priority routing refresh windows within TomTom contract limits",
    "Compare more stays with saved destination sets"
  ],
  cancel_and_renew_terms: {
    trial:
      "Proposed 30-day free trial starts only after Owner enables checkout and the user explicitly starts Travel Plus. No charge during trial.",
    renew:
      "After trial, proposed auto-renew is €4.99/month. Auto-renew stays OFF until Owner sets auto_renew_enabled=true and the user keeps an active payment method.",
    cancel:
      "Cancel anytime before renewal from account billing (when armed). Access continues through the paid period already purchased; no silent renewals while checkout is OFF.",
    honesty:
      "This is a product readiness scaffold only. No Stripe price, no Checkout Session, and no customer charge are created while sales_enabled=false."
  },
  honesty:
    "Travel Plus must add measurable smart value — never resell free third-party basemaps or Commons photos. Existing free Tickets travel features stay free. Checkout and charging remain disabled until Owner approval."
});

function travelPlusStatus() {
  return {
    ok: true,
    product: TRAVEL_PLUS,
    armed: false,
    user_chargeable: false,
    sales_enabled: false,
    billing_enabled: false,
    auto_renew_enabled: false,
    checkout_enabled: false,
    free_features_preserved: true,
    message:
      "HAVKAR Travel Plus proposed at €4.99/month with 30-day trial — sales, auto-renew, and checkout are OFF. Free GPS / My trips / memories / reminders stay free."
  };
}

module.exports = {
  TRAVEL_PLUS,
  travelPlusStatus
};
