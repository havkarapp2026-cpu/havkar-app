/*
 * Fiat currencies HAVKAR may charge through Stripe after owner activation.
 * Live collection still requires HAVKAR_REAL_PAYMENTS_ENABLED=true and,
 * for sk_live_ keys, HAVKAR_STRIPE_LIVE_ENABLED=true.
 *
 * Default allow-list is the verified Stripe presentment matrix (133 codes
 * for the Italian HAVKAR account). Override with HAVKAR_STRIPE_FIAT_CURRENCIES
 * (CSV) when Owner wants a narrower live set.
 */

const {
  listStripeCurrencies60,
  listStripePresentmentCurrencies,
  getCurrencyMeta,
  isSupportedCheckoutCurrency,
  toMinorUnits,
  applyBuyerSellerFeesMajor,
  PRESENTMENT_COUNT
} = require("./stripe-supported-currencies-60.cjs");

const DEFAULT_ALLOWED = Object.freeze(
  listStripePresentmentCurrencies().map((row) => row.code)
);

function allowedStripeFiatCurrencies(env = process.env) {
  const raw = String(env.HAVKAR_STRIPE_FIAT_CURRENCIES || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  const list = raw.length ? raw : DEFAULT_ALLOWED.slice();
  return list.filter((code) => isSupportedCheckoutCurrency(code));
}

function normalizeStripeFiatCurrency(input, env = process.env) {
  const requested = String(input || "eur").trim().toLowerCase();
  const allowed = allowedStripeFiatCurrencies(env);
  const meta = getCurrencyMeta(requested);

  if (!meta || !allowed.includes(requested)) {
    return {
      ok: false,
      error:
        "Unsupported checkout currency. Allowed: " +
        allowed
          .slice(0, 12)
          .map((c) => c.toUpperCase())
          .join(", ") +
        (allowed.length > 12 ? ", …" : "")
    };
  }

  return {
    ok: true,
    currency: requested,
    currencyUpper: requested.toUpperCase(),
    meta,
    zero_decimal: meta.decimals === 0,
    live_collection_gated: true
  };
}

function describeCurrencyMatrix(env = process.env) {
  const allowed = new Set(allowedStripeFiatCurrencies(env));
  const currencies = listStripePresentmentCurrencies();
  return {
    count: PRESENTMENT_COUNT || currencies.length,
    source: "https://docs.stripe.com/currencies",
    display_currency: "buyer-selected presentment",
    charge_currency: "Stripe Checkout / PaymentIntent currency",
    settlement_currency: "eur",
    settlement_note:
      "Stripe settles to the HAVKAR Italian account settlement currency (EUR / Revolut Business). Stripe does not settle XLM.",
    live_payments_require_owner_flags: [
      "HAVKAR_REAL_PAYMENTS_ENABLED",
      "HAVKAR_STRIPE_LIVE_ENABLED"
    ],
    currencies: currencies.map((row) => ({
      ...row,
      checkout_allowed: allowed.has(row.code)
    }))
  };
}

module.exports = {
  DEFAULT_ALLOWED,
  PRESENTMENT_COUNT,
  allowedStripeFiatCurrencies,
  normalizeStripeFiatCurrency,
  describeCurrencyMatrix,
  listStripeCurrencies60,
  listStripePresentmentCurrencies,
  getCurrencyMeta,
  isSupportedCheckoutCurrency,
  toMinorUnits,
  applyBuyerSellerFeesMajor
};
