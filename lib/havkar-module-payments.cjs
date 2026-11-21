/*
 * Gated payment-method catalogs for Ads, Business listing, Hotels, AI.
 * Quotes/display only until Owner arms module live flags.
 * Flights and Trade remain blocked/refused elsewhere.
 */

const {
  PRESENTMENT_COUNT,
  listStripePresentmentCurrencies
} = require("./stripe-supported-currencies-60.cjs");
const { cardPaymentsAllowed } = require("./real-payments.cjs");
const { mainnetCustomerLiveReady } = require("./stellar-mainnet.cjs");
const {
  AI_CREDIT_PACKS,
  BUSINESS_LISTING_PLANS
} = require("./havkar-global-payments.cjs");

const ADS_LIVE_FLAG = "HAVKAR_ADS_BOOST_TEST_ENABLED";
const BUSINESS_LIVE_FLAG = "HAVKAR_BUSINESS_LISTING_PAYMENTS_ENABLED";
const HOTELS_LIVE_FLAG = "HAVKAR_HOTELS_LIVE_BOOKING_ENABLED";
const AI_LIVE_FLAG = "HAVKAR_REAL_PAYMENTS_ENABLED";

function flagOn(env, name) {
  return String((env || process.env)[name] || "") === "true";
}

function stripeCount() {
  return PRESENTMENT_COUNT || listStripePresentmentCurrencies().length;
}

function availability(chargeAllowed) {
  if (chargeAllowed) {
    return {
      status: "available",
      status_label: "Available",
      status_label_it: "Disponibile"
    };
  }
  return {
    status: "not_yet_available",
    status_label: "Not yet available",
    status_label_it: "Non ancora disponibile"
  };
}

function adsPaymentMethods(env = process.env) {
  const testArmed = flagOn(env, ADS_LIVE_FLAG) && String(env.STRIPE_SECRET_KEY || "").startsWith("sk_test_");
  const xlmLive = mainnetCustomerLiveReady(env);
  const stripeAvail = availability(testArmed);
  const xlmAvail = availability(xlmLive);
  return {
    ok: true,
    module: "ads",
    public_live_charging: false,
    live_flag: ADS_LIVE_FLAG,
    live_flag_armed: testArmed,
    stripe_presentment_count: stripeCount(),
    xlm_is_not_a_stripe_currency: true,
    boost_list_price_eur: 5,
    methods: [
      {
        id: "stripe",
        label: "Card (Stripe test boost)",
        charge_allowed_now: testArmed,
        ...stripeAvail,
        note: "Production live ads boost stays OFF. Test mode only when Owner sets HAVKAR_ADS_BOOST_TEST_ENABLED with sk_test_."
      },
      {
        id: "xlm_mainnet",
        label: "Stellar XLM — Pay with XLM wallet",
        charge_allowed_now: xlmLive,
        ...xlmAvail,
        note: "One-time XLM boost only when Mainnet collection is Owner-armed."
      }
    ],
    gate: {
      message: testArmed
        ? "Stripe ads boost test mode is armed."
        : "Ads live charging is not armed. Quotes and test boost remain gated."
    }
  };
}

function businessPaymentMethods(env = process.env) {
  const stripeLive = cardPaymentsAllowed(env) && flagOn(env, BUSINESS_LIVE_FLAG);
  const xlmLive = mainnetCustomerLiveReady(env) && flagOn(env, BUSINESS_LIVE_FLAG);
  return {
    ok: true,
    module: "business",
    public_live_charging: false,
    live_flag: BUSINESS_LIVE_FLAG,
    live_flag_armed: flagOn(env, BUSINESS_LIVE_FLAG),
    stripe_presentment_count: stripeCount(),
    xlm_is_not_a_stripe_currency: true,
    plans: BUSINESS_LISTING_PLANS,
    methods: [
      {
        id: "stripe",
        label: "Card (Stripe)",
        charge_allowed_now: stripeLive,
        ...availability(stripeLive)
      },
      {
        id: "xlm_mainnet",
        label: "Stellar XLM — Pay with XLM wallet",
        charge_allowed_now: xlmLive,
        ...availability(xlmLive),
        note: "One-time prepaid business listing only. No automatic XLM renewals."
      }
    ],
    gate: {
      message: flagOn(env, BUSINESS_LIVE_FLAG)
        ? "Business listing live flag is set; still requires card/XLM arming gates."
        : "Visible quotes allowed; public live business listing charges remain disabled until Owner sets HAVKAR_BUSINESS_LISTING_PAYMENTS_ENABLED=true."
    }
  };
}

function hotelsPaymentMethods(env = process.env) {
  const live = flagOn(env, HOTELS_LIVE_FLAG);
  const stripeLive = cardPaymentsAllowed(env) && live;
  const xlmLive = mainnetCustomerLiveReady(env) && live;
  return {
    ok: true,
    module: "hotels",
    public_live_booking: false,
    live_flag: HOTELS_LIVE_FLAG,
    live_flag_armed: live,
    stripe_presentment_count: stripeCount(),
    xlm_is_not_a_stripe_currency: true,
    xlm_flow: "services",
    HOTELS_LIVE_BOOKING_OFF: !live,
    methods: [
      {
        id: "stripe",
        label: "Card (Stripe)",
        charge_allowed_now: stripeLive,
        display_only: !stripeLive,
        ...availability(stripeLive)
      },
      {
        id: "xlm_mainnet",
        label: "Stellar XLM — Pay with XLM wallet",
        charge_allowed_now: xlmLive,
        display_only: !xlmLive,
        xlm_display: true,
        ...availability(xlmLive)
      }
    ],
    gate: {
      message: live
        ? "Hotels live booking flag is set; customer charge still requires payment rails."
        : "Hotels payment methods are display-only until Owner sets HAVKAR_HOTELS_LIVE_BOOKING_ENABLED=true."
    }
  };
}

function aiPaymentMethods(env = process.env) {
  const live = flagOn(env, AI_LIVE_FLAG);
  const stripeLive = cardPaymentsAllowed(env);
  const xlmLive = mainnetCustomerLiveReady(env);
  return {
    ok: true,
    module: "ai",
    public_live_charging: false,
    live_flag: AI_LIVE_FLAG,
    live_flag_armed: live,
    stripe_presentment_count: stripeCount(),
    xlm_is_not_a_stripe_currency: true,
    prepaid_packs: AI_CREDIT_PACKS,
    methods: [
      {
        id: "stripe",
        label: "Card (Stripe prepaid / subscription when configured)",
        charge_allowed_now: stripeLive,
        ...availability(stripeLive),
        note: "Requires STRIPE_AI_*_PRICE_ID and Owner payment flags. Paid image output needs verified entitlement."
      },
      {
        id: "xlm_mainnet",
        label: "Stellar XLM — prepaid ai_credits packs",
        charge_allowed_now: xlmLive,
        ...availability(xlmLive),
        note: "Flow ai_credits only. Automatic XLM renewals are refused."
      }
    ],
    gate: {
      message: live
        ? "Master real-payments flag is on; AI still needs price IDs and entitlement verification."
        : "AI paid plans remain paused for public collection until Owner arms HAVKAR_REAL_PAYMENTS_ENABLED."
    }
  };
}

module.exports = {
  ADS_LIVE_FLAG,
  BUSINESS_LIVE_FLAG,
  HOTELS_LIVE_FLAG,
  adsPaymentMethods,
  businessPaymentMethods,
  hotelsPaymentMethods,
  aiPaymentMethods
};
