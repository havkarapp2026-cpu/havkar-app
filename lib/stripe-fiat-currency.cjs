/*
 * Fiat currencies HAVKAR may charge through Stripe after owner activation.
 * Live collection still requires HAVKAR_REAL_PAYMENTS_ENABLED=true and,
 * for sk_live_ keys, HAVKAR_STRIPE_LIVE_ENABLED=true.
 */

const DEFAULT_ALLOWED = Object.freeze(["eur", "usd"]);

function allowedStripeFiatCurrencies(env = process.env) {
  const raw = String(env.HAVKAR_STRIPE_FIAT_CURRENCIES || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  const list = raw.length ? raw : DEFAULT_ALLOWED.slice();
  return list.filter((code) => /^[a-z]{3}$/.test(code));
}

function normalizeStripeFiatCurrency(input, env = process.env) {
  const requested = String(input || "eur").trim().toLowerCase();
  const allowed = allowedStripeFiatCurrencies(env);

  if (!allowed.includes(requested)) {
    return {
      ok: false,
      error:
        "Unsupported checkout currency. Allowed: " +
        allowed.map((c) => c.toUpperCase()).join(", ")
    };
  }

  return {
    ok: true,
    currency: requested,
    currencyUpper: requested.toUpperCase()
  };
}

module.exports = {
  DEFAULT_ALLOWED,
  allowedStripeFiatCurrencies,
  normalizeStripeFiatCurrency
};
