/**
 * Presentment vs charge vs settlement rails for HAVKAR.
 * Never implies unauthorized live collection is active.
 */
const { realPaymentsEnabled, cardPaymentsAllowed } = require("./real-payments.cjs");

function loadPresentmentCount() {
  try {
    // Browser asset is JS assigning global; for Node we parse Count comment/array length via require path is awkward.
    // Prefer shared JSON-like export if present on global helper files.
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.join(__dirname, "..", "havkar-presentment-currencies.js"),
      "utf8"
    );
    const m = src.match(/Count\s*=\s*(\d+)/);
    if (m) return Number(m[1]);
  } catch (_e) {}
  return null;
}

function buildCurrencyRailsStatus(env = process.env) {
  const presentmentCount = loadPresentmentCount();
  const masterOn = realPaymentsEnabled(env);
  const stripeCards = cardPaymentsAllowed(env);
  const stellarLive =
    env.HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED === "true" &&
    env.HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION === "true";
  const healthLive = env.HAVKAR_HEALTH_LIVE_BILLING_ENABLED === "true";
  const hotelsLive = env.HAVKAR_HOTELS_LIVE_BOOKING_ENABLED === "true";

  return {
    ok: true,
    action: "currency_rails_status",
    presentment: {
      count: presentmentCount,
      role: "display_only_unless_also_chargeable",
      note: "Presentment currencies are for UI display and quotes. Not every code is a live charge currency."
    },
    charge: {
      stripe_cards_allowed: stripeCards,
      role: "server_validated_charge_currency",
      note: "Charge currencies require Stripe capability + Owner payment flags."
    },
    settlement: {
      stripe_connect_payouts: "owner_kyb_required",
      stellar_xlm_rail: "separate_from_stripe",
      stellar_mainnet_live_collection: stellarLive,
      role: "settlement_after_successful_charge"
    },
    gates: {
      HAVKAR_REAL_PAYMENTS_ENABLED: masterOn,
      HAVKAR_STRIPE_LIVE_ENABLED: env.HAVKAR_STRIPE_LIVE_ENABLED === "true",
      HAVKAR_HEALTH_LIVE_BILLING_ENABLED: healthLive,
      HAVKAR_HOTELS_LIVE_BOOKING_ENABLED: hotelsLive,
      live_customer_collection: masterOn && stripeCards
    },
    honesty: {
      live_payments_paused: !masterOn || !stripeCards,
      xlm_is_not_a_stripe_currency: true,
      unauthorized_live_activation_forbidden: true
    }
  };
}

module.exports = {
  buildCurrencyRailsStatus
};
