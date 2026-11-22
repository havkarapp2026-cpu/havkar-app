/**
 * Presentment vs charge vs settlement rails for HAVKAR.
 * Never implies unauthorized live collection is active.
 * Module gates (Health/Hotels/Duffel/Omio/telehealth) are independent of
 * the already-authorized global Stripe/XLM customer collection flags.
 */
const { realPaymentsEnabled, cardPaymentsAllowed } = require("./real-payments.cjs");
const { classifyDuffelAccessToken } = require("./duffel-live-ready.cjs");

function loadPresentmentCount() {
  try {
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
  const healthLiveFlag = env.HAVKAR_HEALTH_LIVE_BILLING_ENABLED === "true";
  const hotelsLive = env.HAVKAR_HOTELS_LIVE_BOOKING_ENABLED === "true";
  const duffel = classifyDuffelAccessToken(env);
  const omioReady = env.HAVKAR_OMIO_API_ENABLED === "true";
  const telehealthReady = env.HAVKAR_TELEHEALTH_LIVE_ENABLED === "true";

  // Global customer collection pause (Stripe cards). Independent of Health.
  const livePaymentsPaused = !masterOn || !stripeCards;

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
      HAVKAR_JOB_PAYMENTS_ENABLED: env.HAVKAR_JOB_PAYMENTS_ENABLED === "true",
      HAVKAR_SERVICE_PAYMENTS_ENABLED:
        env.HAVKAR_SERVICE_PAYMENTS_ENABLED === "true",
      HAVKAR_HEALTH_LIVE_BILLING_ENABLED: healthLiveFlag,
      HAVKAR_HOTELS_LIVE_BOOKING_ENABLED: hotelsLive,
      HAVKAR_DUFFEL_LIVE_ORDERS_ENABLED:
        env.HAVKAR_DUFFEL_LIVE_ORDERS_ENABLED === "true",
      HAVKAR_OMIO_API_ENABLED: omioReady,
      HAVKAR_TELEHEALTH_LIVE_ENABLED: telehealthReady,
      live_customer_collection: masterOn && stripeCards
    },
    module_scopes: {
      global_stripe_customer_collection: livePaymentsPaused
        ? "paused"
        : "armed_by_owner",
      global_xlm_mainnet_collection: stellarLive ? "armed_by_owner" : "paused",
      jobs_listing_payments: {
        flag: env.HAVKAR_JOB_PAYMENTS_ENABLED === "true",
        charge_allowed_now:
          masterOn &&
          stripeCards &&
          env.HAVKAR_JOB_PAYMENTS_ENABLED === "true",
        effective:
          env.HAVKAR_JOB_PAYMENTS_ENABLED === "true" && masterOn && stripeCards
            ? "armed"
            : "OFF",
        note: "Ordinary Jobs 30-day prepaid + corporate Stripe subscriptions. Requires HAVKAR_JOB_PAYMENTS_ENABLED."
      },
      services_payments: {
        flag: env.HAVKAR_SERVICE_PAYMENTS_ENABLED === "true",
        charge_allowed_now:
          masterOn &&
          stripeCards &&
          env.HAVKAR_SERVICE_PAYMENTS_ENABLED === "true",
        provider_commission_bps: 1000,
        effective:
          env.HAVKAR_SERVICE_PAYMENTS_ENABLED === "true" &&
          masterOn &&
          stripeCards
            ? "armed"
            : "OFF",
        note: "Customer pays listed price; provider owes 10% (1000 bps)."
      },
      health_subscription_billing: {
        flag: healthLiveFlag,
        charge_allowed_now: false,
        effective: "OFF",
        note: "Health checkout remains refused (charge_allowed_now=false) even if the catalog flag is toggled; independent of global Stripe/XLM."
      },
      hotels_live_booking: {
        flag: hotelsLive,
        effective: hotelsLive ? "flag_on_requires_provider" : "OFF"
      },
      duffel_flights: {
        token_mode: duffel.mode,
        live_orders_possible: duffel.live_orders_possible === true,
        effective:
          duffel.live_orders_possible === true ? "armed" : "blocked_or_test"
      },
      omio_rail_bus_ferry: {
        flag: omioReady,
        effective: omioReady ? "flag_on_requires_partner_api" : "blocked_partner"
      },
      telehealth_voice_video: {
        flag: telehealthReady,
        effective: "BLOCKED_in_code",
        note: "Voice/video remain hard-blocked in health API until clinical contract + separate Owner order."
      }
    },
    honesty: {
      live_payments_paused: livePaymentsPaused,
      live_payments_paused_means:
        "Global Stripe customer card collection pause only — not Health, Hotels, Omio, or telehealth.",
      why_health_can_be_off_while_paused_false:
        "Owner already authorized global Stripe/XLM collection; Health uses HAVKAR_HEALTH_LIVE_BILLING_ENABLED and still forces charge_allowed_now=false.",
      xlm_is_not_a_stripe_currency: true,
      unauthorized_live_activation_forbidden: true,
      do_not_disable_authorized_rails: true
    }
  };
}

module.exports = {
  buildCurrencyRailsStatus
};
