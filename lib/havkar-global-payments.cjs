/*
 * HAVKAR global payment catalog and gated quote helpers.
 * Public live collection stays OFF until Owner flags arm it.
 * XLM never claims automatic recurring debits.
 */

const {
  listStripeCurrencies60,
  getCurrencyMeta,
  isSupportedCheckoutCurrency
} = require("./stripe-supported-currencies-60.cjs");
const {
  quoteWithFees,
  fetchEurRates
} = require("./havkar-fx-rates.cjs");
const {
  realPaymentsEnabled,
  cardPaymentsAllowed,
  REAL_PAYMENTS_PAUSED_CODE,
  REAL_PAYMENTS_PAUSED_MESSAGE
} = require("./real-payments.cjs");
const {
  stellarMainnetPaymentsEnabled,
  stellarMainnetLiveCollectionEnabled,
  mainnetCustomerLiveReady,
  readMainnetDestination
} = require("./stellar-mainnet.cjs");
const {
  ALLOWED_XLM_FLOWS,
  quoteFeesForFlow,
  evaluateStellarCheckout
} = require("./stellar-checkout.cjs");

const AI_CREDIT_PACKS = Object.freeze([
  {
    id: "ai_credits_plus",
    name: "HAVKAR AI Plus credits (30 days prepaid)",
    list_price_eur: 7.99,
    period_days: 30,
    billing: "one_time_prepaid"
  },
  {
    id: "ai_credits_pro",
    name: "HAVKAR AI Pro credits (30 days prepaid)",
    list_price_eur: 14.99,
    period_days: 30,
    billing: "one_time_prepaid"
  },
  {
    id: "ai_credits_business",
    name: "HAVKAR AI Business credits (30 days prepaid)",
    list_price_eur: 29.99,
    period_days: 30,
    billing: "one_time_prepaid"
  }
]);

const JOB_LISTING_PLANS = Object.freeze([
  {
    id: "jobs_listing_30d",
    name: "Jobs listing — 30 days prepaid",
    list_price_eur: 19.99,
    period_days: 30,
    billing: "one_time_prepaid"
  },
  {
    id: "jobs_listing_90d",
    name: "Jobs listing — 90 days prepaid",
    list_price_eur: 49.99,
    period_days: 90,
    billing: "one_time_prepaid"
  }
]);

const BUSINESS_LISTING_PLANS = Object.freeze([
  {
    id: "business_listing_annual",
    name: "Business profile listing — 365 days prepaid",
    list_price_eur: 99,
    period_days: 365,
    billing: "one_time_prepaid"
  }
]);

function moduleStatus(liveOn, implemented) {
  if (!implemented) return "missing";
  return liveOn ? "live_armed" : "implemented_gated";
}

function moduleCatalog() {
  const xlmFlows = ALLOWED_XLM_FLOWS.slice();
  const stripeCount = listStripeCurrencies60().length;
  const liveStripe = cardPaymentsAllowed();
  const liveXlm = mainnetCustomerLiveReady();
  const dest = readMainnetDestination(process.env);
  const publicLive = liveStripe || liveXlm;

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    public_live_checkout: publicLive,
    real_payments_enabled: realPaymentsEnabled(),
    owner_authorization: "granted",
    stripe: {
      currency_count: stripeCount,
      currencies_verified: stripeCount === 60,
      source: "https://docs.stripe.com/currencies",
      live_collection_allowed: liveStripe,
      display_vs_charge_vs_settlement:
        "display=buyer selected presentment; charge=Stripe Checkout/PI currency; settlement=Stripe account settlement currency"
    },
    stellar_xlm_mainnet: {
      payments_flag: stellarMainnetPaymentsEnabled(),
      live_collection_flag: stellarMainnetLiveCollectionEnabled(),
      customer_live_ready: liveXlm,
      destination_configured: dest.ok === true,
      automatic_recurring_debits: false,
      supported_one_time_flows: xlmFlows
    },
    modules: [
      {
        id: "marketplace",
        name: "Buy & Sell",
        checkout_controller: "havkar",
        xlm_flow: "marketplace",
        xlm: moduleStatus(liveXlm, xlmFlows.includes("marketplace")),
        stripe: moduleStatus(liveStripe, true),
        fiat_currencies: stripeCount,
        notes: "BUY NOW on ad-details; Connect destination charges when armed."
      },
      {
        id: "services",
        name: "Services",
        checkout_controller: "havkar",
        xlm_flow: "services",
        xlm: moduleStatus(liveXlm, xlmFlows.includes("services")),
        stripe: moduleStatus(liveStripe, true),
        fiat_currencies: stripeCount,
        notes: "10% provider commission on one-time service prices."
      },
      {
        id: "jobs",
        name: "Jobs listings",
        checkout_controller: "havkar",
        xlm_flow: "jobs_listing",
        xlm: moduleStatus(liveXlm, xlmFlows.includes("jobs_listing")),
        stripe: moduleStatus(liveStripe, true),
        fiat_currencies: stripeCount,
        notes:
          "One-time prepaid listing windows only. No automatic XLM renewals.",
        prepaid_plans: JOB_LISTING_PLANS
      },
      {
        id: "events",
        name: "Events / tickets / QR admission",
        checkout_controller: "havkar",
        xlm_flow: "events",
        xlm: moduleStatus(liveXlm, xlmFlows.includes("events")),
        stripe: moduleStatus(liveStripe, true),
        fiat_currencies: stripeCount,
        notes: "QR ticket issued after verified settlement."
      },
      {
        id: "ai",
        name: "HAVKAR AI credits",
        checkout_controller: "havkar",
        xlm_flow: "ai_credits",
        xlm: moduleStatus(liveXlm, xlmFlows.includes("ai_credits")),
        stripe: moduleStatus(liveStripe, true),
        fiat_currencies: stripeCount,
        notes:
          "Prepaid credit packs only. Native automatic XLM subscription debits are not claimed.",
        prepaid_packs: AI_CREDIT_PACKS
      },
      {
        id: "ads",
        name: "Advertising boosts",
        checkout_controller: "havkar",
        xlm_flow: "ads",
        xlm: moduleStatus(liveXlm, xlmFlows.includes("ads")),
        stripe: liveStripe ? "live_armed" : "implemented_gated_test_mode",
        fiat_currencies: stripeCount,
        notes:
          "XLM one-time boost live when Mainnet collection is armed. Stripe boost still uses dedicated test flag unless marketplace/events rails are used."
      },
      {
        id: "business",
        name: "Business / company listing",
        checkout_controller: "havkar",
        xlm_flow: "business_listing",
        xlm: moduleStatus(liveXlm, xlmFlows.includes("business_listing")),
        stripe: moduleStatus(liveStripe, true),
        fiat_currencies: stripeCount,
        notes: "One-time prepaid business listing period.",
        prepaid_plans: BUSINESS_LISTING_PLANS
      },
      {
        id: "flights",
        name: "Flights (HAVKAR / Duffel)",
        checkout_controller: "havkar",
        xlm_flow: "flights",
        xlm: "blocked_pending_duffel_live",
        stripe: "blocked_pending_duffel_live",
        fiat_currencies: stripeCount,
        notes:
          "Customer money stays blocked until Duffel live booking/settlement merchant authorization is verified. Duffel TEST MODE orders remain available."
      },
      {
        id: "omio_rail",
        name: "Trains / buses / ferries (Omio affiliate)",
        checkout_controller: "external_partner",
        xlm: "not_applicable",
        stripe: "not_applicable",
        fiat_currencies: 0,
        notes:
          "External Omio checkout. HAVKAR does not collect XLM/Stripe for partner tickets."
      },
      {
        id: "trade",
        name: "Trade / crypto exchange",
        checkout_controller: "havkar",
        xlm: "refused",
        stripe: "refused",
        fiat_currencies: 0,
        notes: "Trade remains unavailable / not an XLM checkout."
      }
    ],
    gate: publicLive
      ? {
          code: "LIVE_PAYMENTS_ARMED",
          message:
            "Owner-authorized live collection is armed for eligible HAVKAR-controlled modules."
        }
      : {
          code: REAL_PAYMENTS_PAUSED_CODE,
          message: REAL_PAYMENTS_PAUSED_MESSAGE
        }
  };
}

function resolveListPriceEur(moduleId, subjectId, explicitPrice) {
  const price = Number(explicitPrice);
  if (Number.isFinite(price) && price > 0) {
    return { ok: true, list_price_eur: price, source: "explicit" };
  }

  if (moduleId === "ai") {
    const pack = AI_CREDIT_PACKS.find((row) => row.id === subjectId);
    if (!pack) {
      return { ok: false, error: "Unknown AI credit pack subject_id." };
    }
    return {
      ok: true,
      list_price_eur: pack.list_price_eur,
      source: "ai_pack",
      pack
    };
  }

  if (moduleId === "jobs") {
    const plan = JOB_LISTING_PLANS.find((row) => row.id === subjectId);
    if (!plan) {
      return { ok: false, error: "Unknown jobs listing plan subject_id." };
    }
    return {
      ok: true,
      list_price_eur: plan.list_price_eur,
      source: "jobs_plan",
      plan
    };
  }

  if (moduleId === "business") {
    const plan = BUSINESS_LISTING_PLANS.find((row) => row.id === subjectId);
    if (!plan) {
      return { ok: false, error: "Unknown business listing plan subject_id." };
    }
    return {
      ok: true,
      list_price_eur: plan.list_price_eur,
      source: "business_plan",
      plan
    };
  }

  return {
    ok: false,
    error: "list_price_eur or a known prepaid subject_id is required."
  };
}

async function buildGlobalPaymentQuote(input) {
  const moduleId = String(input.module || "").toLowerCase();
  const method = String(input.method || "stripe").toLowerCase();
  const catalog = moduleCatalog();
  const mod = catalog.modules.find((row) => row.id === moduleId);

  if (!mod) {
    return { ok: false, status: 400, error: "Unknown paid module." };
  }

  if (mod.checkout_controller === "external_partner") {
    return {
      ok: false,
      status: 403,
      code: "EXTERNAL_PARTNER_CHECKOUT",
      error:
        "This product uses an external partner checkout. HAVKAR does not collect XLM or Stripe for it."
    };
  }

  if (mod.xlm === "refused" || mod.stripe === "refused") {
    return {
      ok: false,
      status: 403,
      code: "MODULE_REFUSED",
      error: mod.notes || "This module refuses HAVKAR checkout."
    };
  }

  const priced = resolveListPriceEur(
    moduleId,
    String(input.subject_id || ""),
    input.list_price_eur
  );
  if (!priced.ok) {
    return { ok: false, status: 400, error: priced.error };
  }

  if (method === "xlm" || method === "xlm_mainnet") {
    const flow = mod.xlm_flow;
    if (!flow || !ALLOWED_XLM_FLOWS.includes(flow)) {
      return {
        ok: false,
        status: 403,
        code: "XLM_FLOW_UNSUPPORTED",
        error: "XLM is not enabled for this module."
      };
    }

    const decision = evaluateStellarCheckout(
      {
        flow: flow,
        price: priced.list_price_eur,
        subject_id: input.subject_id,
        idempotency_key: input.idempotency_key || "globalpay-" + Date.now(),
        network: method === "xlm_mainnet" ? "mainnet" : input.network || "testnet"
      },
      new Date(),
      process.env
    );

    return {
      ok: decision.ok === true,
      status: decision.status || (decision.ok ? 200 : 400),
      module: mod,
      method: "xlm",
      list_price_eur: priced.list_price_eur,
      fees: decision.fees || quoteFeesForFlow(flow, priced.list_price_eur),
      decision: decision,
      public_live_checkout: catalog.public_live_checkout,
      live_checkout_allowed: mainnetCustomerLiveReady(),
      gate: catalog.gate
    };
  }

  if (method !== "stripe") {
    return {
      ok: false,
      status: 400,
      error: "method must be stripe, xlm, or xlm_mainnet."
    };
  }

  const currency = String(input.currency || "eur").toLowerCase();
  if (!isSupportedCheckoutCurrency(currency)) {
    return {
      ok: false,
      status: 400,
      error: "Currency is not in the verified Stripe 60-currency matrix."
    };
  }

  const rates = await fetchEurRates();
  const quote = quoteWithFees(
    priced.list_price_eur,
    currency.toUpperCase(),
    rates.rates
  );
  if (!quote.ok) {
    return { ok: false, status: 409, error: quote.error || "FX quote failed." };
  }

  return {
    ok: true,
    status: 200,
    module: mod,
    method: "stripe",
    list_price_eur: priced.list_price_eur,
    currency: getCurrencyMeta(currency),
    quote: {
      ...quote,
      fx_provider: "frankfurter.app",
      fx_date: rates.date,
      display_currency: currency.toUpperCase(),
      charge_currency: currency.toUpperCase(),
      settlement_currency_note:
        "Stripe settles to the connected HAVKAR Stripe account settlement currency.",
      conversion_fee_note:
        "Buyer fee 2% and seller fee 3% are shown for transparency."
    },
    public_live_checkout: catalog.public_live_checkout,
    live_checkout_allowed: cardPaymentsAllowed(),
    gate: catalog.gate
  };
}

function refuseLiveCheckout(method, reason) {
  const liveStripe = cardPaymentsAllowed();
  const liveXlm = mainnetCustomerLiveReady();
  const wantsStripe = !method || method === "stripe";
  const wantsXlm = method === "xlm" || method === "xlm_mainnet";

  if (wantsStripe && liveStripe) {
    return {
      ok: true,
      status: 200,
      code: "LIVE_CHECKOUT_ARMED",
      method: "stripe",
      public_live_checkout: true,
      live_checkout_allowed: true,
      note:
        "Stripe live collection is Owner-armed. Use module checkout routes or create a verified Checkout Session; this endpoint alone does not invent a charge.",
      next:
        reason ||
        "Call module-specific checkout (events/marketplace/jobs/AI) with authentication."
    };
  }

  if (wantsXlm && liveXlm) {
    return {
      ok: true,
      status: 200,
      code: "LIVE_CHECKOUT_ARMED",
      method: method || "xlm_mainnet",
      public_live_checkout: true,
      live_checkout_allowed: true,
      note:
        "Stellar XLM Mainnet live collection is Owner-armed. Create an unpaid Mainnet quote via payment_method=xlm then settle with a Horizon-verified tx.",
      next:
        reason ||
        "POST /api/create-event-checkout with payment_method=xlm and network=mainnet."
    };
  }

  return {
    ok: false,
    status: 403,
    code: "GLOBAL_LIVE_CHECKOUT_NOT_ARMED",
    error:
      "Live checkout is not armed for the requested method. No payment was taken.",
    method: method || null,
    public_live_checkout: false,
    stripe_live: liveStripe,
    xlm_live: liveXlm,
    note:
      "No Stripe charge, XLM transfer, fulfillment, or refund was created by this request."
  };
}

module.exports = {
  AI_CREDIT_PACKS,
  JOB_LISTING_PLANS,
  BUSINESS_LISTING_PLANS,
  moduleCatalog,
  resolveListPriceEur,
  buildGlobalPaymentQuote,
  refuseLiveCheckout
};
