/*
 * Jobs + Services payment method catalog (Stripe vs Stellar XLM).
 * Live collection stays gated by Owner flags.
 * Ordinary Jobs listings: one-time prepaid (Stripe or XLM).
 * Corporate Jobs subscriptions: Stripe recurring only (XLM cannot auto-renew).
 * Services: customer pays listed price; provider owes 10% (1000 bps).
 */

const {
  PRESENTMENT_COUNT,
  listStripePresentmentCurrencies
} = require("./stripe-supported-currencies-60.cjs");
const { cardPaymentsAllowed } = require("./real-payments.cjs");
const {
  mainnetCustomerLiveReady
} = require("./stellar-mainnet.cjs");
const jobBilling = require("../havkar-job-billing.js");
const serviceCommerce = require("../havkar-service-commerce.js");

const JOBS_LIVE_FLAG = "HAVKAR_JOB_PAYMENTS_ENABLED";
const SERVICES_LIVE_FLAG = "HAVKAR_SERVICE_PAYMENTS_ENABLED";

function flagOn(env, name) {
  return String((env || process.env)[name] || "") === "true";
}

function stripeCurrencyCount() {
  return PRESENTMENT_COUNT || listStripePresentmentCurrencies().length;
}

function ordinaryListingPlans() {
  return Object.keys(jobBilling.ORDINARY_PLANS).map((name) => {
    const plan = jobBilling.ORDINARY_PLANS[name];
    return {
      id: name,
      name: name,
      list_price_eur: plan.eur,
      period_days: plan.durationDays || 30,
      billing: "one_time_prepaid",
      auto_renew: false,
      source: "havkar-job-billing.ORDINARY_PLANS"
    };
  });
}

function corporateSubscriptionPlans() {
  return Object.keys(jobBilling.COMPANY_PLANS).map((code) => {
    const plan = jobBilling.COMPANY_PLANS[code];
    return {
      id: code,
      list_price_eur: plan.eur,
      interval: plan.interval,
      active_listing_limit: plan.activeAdvertisementLimit,
      billing: "stripe_subscription_monthly",
      xlm_supported: false,
      requires_verified_company: true,
      source: "havkar-job-billing.COMPANY_PLANS"
    };
  });
}

function availability(liveArmed, chargeAllowed) {
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

function jobsPaymentMethods(env = process.env) {
  const stripeLive = cardPaymentsAllowed(env) && flagOn(env, JOBS_LIVE_FLAG);
  const xlmLive = mainnetCustomerLiveReady(env) && flagOn(env, JOBS_LIVE_FLAG);
  const stripeAvail = availability(stripeLive, stripeLive);
  const xlmAvail = availability(xlmLive, xlmLive);
  const currencies = stripeCurrencyCount();

  return {
    ok: true,
    module: "jobs",
    public_live_charging: stripeLive || xlmLive,
    live_flag: JOBS_LIVE_FLAG,
    live_flag_armed: flagOn(env, JOBS_LIVE_FLAG),
    stripe_presentment_count: currencies,
    xlm_is_not_a_stripe_currency: true,
    ordinary_listing_plans: ordinaryListingPlans(),
    corporate_subscription_plans: corporateSubscriptionPlans(),
    ordinary_listing_price_source:
      "Approved one-time 30-day ordinary plans in havkar-job-billing.js (Basic 9.99 / Professional 19.99 / Business 39.99 EUR). Not invented here.",
    methods: [
      {
        id: "stripe",
        kind: "fiat_card",
        label: "Stripe — Pay by card / supported currencies",
        label_it: "Stripe — Paga con carta / valute supportate",
        symbol: null,
        currency_count: currencies,
        supports_ordinary_one_time: true,
        supports_corporate_subscription: true,
        ...stripeAvail,
        charge_allowed_now: stripeLive,
        note:
          "Ordinary listings: one-time Checkout. Corporate plans: monthly Stripe Subscription after verified company status."
      },
      {
        id: "xlm_mainnet",
        kind: "stellar_xlm",
        label: "Stellar XLM — Pay with XLM wallet",
        label_it: "Stellar XLM — Paga con wallet XLM",
        symbol: "✦",
        currency_count: 1,
        supports_ordinary_one_time: true,
        supports_corporate_subscription: false,
        ...xlmAvail,
        charge_allowed_now: xlmLive,
        uses_existing_rails: [
          "lib/stellar-checkout.cjs",
          "lib/stellar-mainnet.cjs",
          "jobs_listing flow",
          "Horizon verification + memo uniqueness"
        ],
        note:
          "XLM is not a Stripe currency. One-time ordinary listing windows only. Corporate monthly renewals require Stripe (XLM cannot auto-debit)."
      }
    ],
    gate: {
      code: flagOn(env, JOBS_LIVE_FLAG) ? "JOBS_PAYMENTS_ARMED" : "JOBS_PAYMENTS_OFF",
      message: flagOn(env, JOBS_LIVE_FLAG)
        ? "Owner-authorized job payment collection is armed."
        : "Visible quotes allowed; public live job charges remain disabled until Owner sets HAVKAR_JOB_PAYMENTS_ENABLED=true."
    }
  };
}

function servicesPaymentMethods(env = process.env) {
  const stripeLive = cardPaymentsAllowed(env) && flagOn(env, SERVICES_LIVE_FLAG);
  const xlmLive = mainnetCustomerLiveReady(env) && flagOn(env, SERVICES_LIVE_FLAG);
  const stripeAvail = availability(stripeLive, stripeLive);
  const xlmAvail = availability(xlmLive, xlmLive);
  const currencies = stripeCurrencyCount();
  const commission = serviceCommerce.commissionPolicy
    ? serviceCommerce.commissionPolicy(env)
    : { ok: true, bps: 1000, payer: "provider" };

  return {
    ok: true,
    module: "services",
    public_live_charging: stripeLive || xlmLive,
    live_flag: SERVICES_LIVE_FLAG,
    live_flag_armed: flagOn(env, SERVICES_LIVE_FLAG),
    stripe_presentment_count: currencies,
    xlm_is_not_a_stripe_currency: true,
    commission_bps: commission.bps || 1000,
    commission_payer: "provider",
    customer_extra_havkar_commission: false,
    offline_cash: {
      bookings_open: false,
      liability_recorded: true,
      collection_state_default: "uncollected",
      note:
        "Cash/offline: provider 10% liability is ledgered; not treated as Stripe-collected funds."
    },
    methods: [
      {
        id: "stripe",
        kind: "fiat_card",
        label: "Stripe — Pay by card / supported currencies",
        label_it: "Stripe — Paga con carta / valute supportate",
        symbol: null,
        currency_count: currencies,
        ...stripeAvail,
        charge_allowed_now: stripeLive,
        note:
          "Customer pays agreed price. Provider pays 10% (1000 bps) via Connect application fee when armed."
      },
      {
        id: "xlm_mainnet",
        kind: "stellar_xlm",
        label: "Stellar XLM — Pay with XLM wallet",
        label_it: "Stellar XLM — Paga con wallet XLM",
        symbol: "✦",
        currency_count: 1,
        ...xlmAvail,
        charge_allowed_now: xlmLive,
        uses_existing_rails: [
          "lib/stellar-checkout.cjs",
          "services flow",
          "Horizon verification"
        ],
        note:
          "One-time service settlement only. Commission accounting remains 1000 bps on provider."
      }
    ],
    gate: {
      code: flagOn(env, SERVICES_LIVE_FLAG)
        ? "SERVICES_PAYMENTS_ARMED"
        : "SERVICES_PAYMENTS_OFF",
      message: flagOn(env, SERVICES_LIVE_FLAG)
        ? "Owner-authorized service payment collection is armed."
        : "Visible quotes allowed; public live service charges remain disabled until Owner sets HAVKAR_SERVICE_PAYMENTS_ENABLED=true."
    }
  };
}

module.exports = {
  JOBS_LIVE_FLAG,
  SERVICES_LIVE_FLAG,
  jobsPaymentMethods,
  servicesPaymentMethods,
  ordinaryListingPlans,
  corporateSubscriptionPlans,
  stripeCurrencyCount
};
