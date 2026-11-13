/*
 * Fiat currencies HAVKAR may charge through Stripe after owner activation.
 * Live collection still requires HAVKAR_REAL_PAYMENTS_ENABLED=true and,
 * for sk_live_ keys, HAVKAR_STRIPE_LIVE_ENABLED=true.
 *
 * Default allow-list is the verified 60-currency Stripe presentment matrix.
 * Override with HAVKAR_STRIPE_FIAT_CURRENCIES (CSV) when needed.
 */

const {
  listStripeCurrencies60,
  getCurrencyMeta,
  isSupportedCheckoutCurrency,
  toMinorUnits,
  applyBuyerSellerFeesMajor
} = require("./stripe-supported-currencies-60.cjs");

const DEFAULT_ALLOWED = Object.freeze(
  listStripeCurrencies60().map((row) => row.code)
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
  return {
    count: allowed.size || 60,
    verified_presentment_matrix: 60,
    source: "https://docs.stripe.com/currencies",
    stripe_account_country: "IT",
    display_currency:
      "Buyer-selected presentment currency shown in checkout UI.",
    charge_currency:
      "Stripe Checkout / PaymentIntent currency (presentment).",
    settlement_currency: "eur",
    settlement_note:
      "HAVKAR Italian Stripe account settles to EUR (Revolut …8455). Stripe converts presentment → EUR when needed.",
    live_payments_require_owner_flags: [
      "HAVKAR_REAL_PAYMENTS_ENABLED",
      "HAVKAR_STRIPE_LIVE_ENABLED"
    ],
    currencies: listStripeCurrencies60().map((row) => ({
      ...row,
      checkout_allowed: allowed.has(row.code),
      role: {
        display: true,
        charge: true,
        settlement: row.code === "eur"
      }
    }))
  };
}

module.exports = {
  DEFAULT_ALLOWED,
  allowedStripeFiatCurrencies,
  normalizeStripeFiatCurrency,
  describeCurrencyMatrix,
  listStripeCurrencies60,
  getCurrencyMeta,
  isSupportedCheckoutCurrency,
  toMinorUnits,
  applyBuyerSellerFeesMajor
};
