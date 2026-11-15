/*
 * HAVKAR unified payment orchestration (catalog + quote + gate).
 * Separates authorization / quoting from service fulfillment.
 * Never activates live collection without Owner flags.
 * Does not store wallet private keys or expose banking secrets.
 */

const {
  moduleCatalog,
  buildGlobalPaymentQuote,
  refuseLiveCheckout,
  resolveListPriceEur,
  AI_CREDIT_PACKS,
  JOB_LISTING_PLANS,
  JOB_CORPORATE_SUBSCRIPTIONS,
  BUSINESS_LISTING_PLANS
} = require("./havkar-global-payments.cjs");
const {
  PRESENTMENT_COUNT,
  listStripePresentmentCurrencies,
  getCurrencyMeta,
  isSupportedCheckoutCurrency,
  toMinorUnits,
  applyBuyerSellerFeesMajor
} = require("./stripe-supported-currencies-60.cjs");
const {
  fetchEurRates,
  quoteWithFees,
  isFxQuoteFresh,
  FX_SOURCE
} = require("./havkar-fx-rates.cjs");
const {
  ALLOWED_XLM_FLOWS,
  evaluateStellarCheckout,
  quoteFeesForFlow
} = require("./stellar-checkout.cjs");
const {
  realPaymentsEnabled,
  cardPaymentsAllowed
} = require("./real-payments.cjs");
const {
  stellarMainnetPaymentsEnabled,
  stellarMainnetLiveCollectionEnabled,
  mainnetCustomerLiveReady
} = require("./stellar-mainnet.cjs");

const IDEMPOTENCY_RE =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function validateIdempotencyKey(key) {
  const value = String(key || "").trim();
  if (!IDEMPOTENCY_RE.test(value)) {
    return {
      ok: false,
      code: "IDEMPOTENCY_KEY_INVALID",
      error:
        "Idempotency key must be 8–128 chars (letters, digits, . _ : -)."
    };
  }
  return { ok: true, key: value };
}

function providerCapabilityMatrix() {
  const currencies = listStripePresentmentCurrencies();
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    stripe_presentment: {
      count: PRESENTMENT_COUNT || currencies.length,
      source: "https://docs.stripe.com/currencies",
      settlement_currency: "EUR",
      xlm_settlement: false,
      note:
        "Stripe supports presentment in these codes for card charges. Settlement remains EUR on the Italian HAVKAR account. Stripe does not settle native XLM."
    },
    stellar_xlm: {
      asset: "native XLM",
      networks: ["testnet", "mainnet"],
      fiat_presentment: false,
      settlement: "on-ledger XLM to Owner destination",
      automatic_recurring: false,
      allowed_one_time_flows: ALLOWED_XLM_FLOWS.slice(),
      payments_flag: stellarMainnetPaymentsEnabled(),
      live_collection_flag: stellarMainnetLiveCollectionEnabled(),
      customer_live_ready: mainnetCustomerLiveReady()
    },
    revolut_business: {
      role: "EUR settlement destination via Stripe payouts / banking",
      public_iban_exposure: false,
      xlm_settlement: false,
      note:
        "Owner Revolut Business EUR account is settlement-side only. Never expose IBAN publicly."
    },
    frankfurter_fx: {
      source: FX_SOURCE,
      base: "EUR",
      role: "display and quote conversion only",
      live_charge_authority: false
    },
    live_gates: {
      real_payments_enabled: realPaymentsEnabled(),
      card_payments_allowed: cardPaymentsAllowed(),
      xlm_customer_live_ready: mainnetCustomerLiveReady()
    }
  };
}

async function orchestrateQuote(input = {}) {
  const method = String(input.method || "stripe").toLowerCase();
  const moduleId = String(input.module || input.flow || "").toLowerCase();
  const idem = validateIdempotencyKey(
    input.idempotency_key || input.idempotencyKey || ""
  );
  if (input.require_idempotency && !idem.ok) {
    return { ...idem, status: 400 };
  }

  if (method === "xlm" || method === "stellar") {
    const decision = evaluateStellarCheckout({
      flow: moduleId || input.flow,
      price: input.price || input.list_price_eur,
      subject_id: input.subject_id,
      idempotency_key: idem.ok ? idem.key : input.idempotency_key,
      network: input.network
    });
    return {
      ...decision,
      orchestration: "havkar-payment-orchestration",
      fulfillment_separated: true,
      paid: false,
      order_paid: false
    };
  }

  const quoted = await buildGlobalPaymentQuote({
    module: moduleId,
    method: "stripe",
    currency: input.currency,
    subject_id: input.subject_id,
    list_price_eur: input.list_price_eur || input.price
  });
  return {
    ...quoted,
    orchestration: "havkar-payment-orchestration",
    fulfillment_separated: true,
    idempotency_key: idem.ok ? idem.key : null
  };
}

function refuseUnauthorizedFulfillment(reason) {
  return {
    ok: false,
    status: 403,
    code: "FULFILLMENT_REQUIRES_VERIFIED_PAYMENT",
    paid: false,
    fulfilled: false,
    error:
      reason ||
      "Service fulfillment requires a server-verified settled payment. Transaction hashes alone are not proof."
  };
}

module.exports = {
  moduleCatalog,
  buildGlobalPaymentQuote,
  refuseLiveCheckout,
  resolveListPriceEur,
  orchestrateQuote,
  providerCapabilityMatrix,
  validateIdempotencyKey,
  refuseUnauthorizedFulfillment,
  fetchEurRates,
  quoteWithFees,
  isFxQuoteFresh,
  getCurrencyMeta,
  isSupportedCheckoutCurrency,
  toMinorUnits,
  applyBuyerSellerFeesMajor,
  quoteFeesForFlow,
  AI_CREDIT_PACKS,
  JOB_LISTING_PLANS,
  JOB_CORPORATE_SUBSCRIPTIONS,
  BUSINESS_LISTING_PLANS,
  ALLOWED_XLM_FLOWS,
  PRESENTMENT_COUNT
};
