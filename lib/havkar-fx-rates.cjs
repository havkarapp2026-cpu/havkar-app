/*
 * Exchange rates for multi-currency quotes (EUR base).
 * Provider: Frankfurter (ECB reference rates) — https://www.frankfurter.app/
 * Used for display/quote only. Does not enable live Stripe collection.
 * Quotes expire; never invent missing rates.
 */

const BUYER_FEE = 0.02;
const SELLER_FEE = 0.03;
const FX_SOURCE = "frankfurter.app";
const FX_SOURCE_URL = "https://api.frankfurter.app/latest?from=EUR";
const FX_PROVIDER_BASIS = "ECB reference rates via Frankfurter";
/** Quote validity window for checkout conversion locks (ms). */
const QUOTE_TTL_MS = 10 * 60 * 1000;

async function fetchEurRates(fetchImpl = fetch, nowMs = Date.now()) {
  const res = await fetchImpl(FX_SOURCE_URL, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) {
    throw new Error("fx_provider_http_" + res.status);
  }
  const body = await res.json();
  if (!body || typeof body.rates !== "object") {
    throw new Error("fx_provider_invalid");
  }
  const fetchedAt = new Date(nowMs).toISOString();
  return {
    ok: true,
    base: "EUR",
    date: body.date || null,
    rates: Object.assign({ EUR: 1 }, body.rates),
    source: FX_SOURCE,
    source_url: FX_SOURCE_URL,
    provider_basis: FX_PROVIDER_BASIS,
    fetched_at: fetchedAt,
    expires_at: new Date(nowMs + QUOTE_TTL_MS).toISOString(),
    ttl_ms: QUOTE_TTL_MS
  };
}

function isFxQuoteFresh(fx, nowMs = Date.now()) {
  if (!fx || !fx.expires_at) return false;
  const exp = Date.parse(fx.expires_at);
  if (!Number.isFinite(exp)) return false;
  return nowMs < exp;
}

function convertMajor(amountEur, currency, rates) {
  const code = String(currency || "EUR").toUpperCase();
  const rate = rates && rates[code];
  if (!rate || !Number.isFinite(Number(rate))) {
    return { ok: false, error: "fx_rate_missing", currency: code };
  }
  const major = Math.round(Number(amountEur) * Number(rate) * 100) / 100;
  return { ok: true, currency: code, rate: Number(rate), amount: major };
}

function quoteWithFees(listPriceEur, currency, rates, fxMeta = null) {
  if (fxMeta && fxMeta.expires_at && !isFxQuoteFresh(fxMeta)) {
    return {
      ok: false,
      error: "fx_quote_expired",
      currency: String(currency || "EUR").toUpperCase(),
      expires_at: fxMeta.expires_at,
      source: fxMeta.source || FX_SOURCE
    };
  }
  const converted = convertMajor(listPriceEur, currency, rates);
  if (!converted.ok) return converted;
  const list = converted.amount;
  const buyerFee = Math.round(list * BUYER_FEE * 100) / 100;
  const sellerFee = Math.round(list * SELLER_FEE * 100) / 100;
  const nowMs = Date.now();
  return {
    ok: true,
    base: "EUR",
    list_price_eur: Number(listPriceEur),
    currency: converted.currency,
    fx_rate: converted.rate,
    fx_date: (fxMeta && fxMeta.date) || null,
    fx_source: (fxMeta && fxMeta.source) || FX_SOURCE,
    fx_source_url: (fxMeta && fxMeta.source_url) || FX_SOURCE_URL,
    fx_provider_basis: (fxMeta && fxMeta.provider_basis) || FX_PROVIDER_BASIS,
    fx_fetched_at: (fxMeta && fxMeta.fetched_at) || null,
    fx_expires_at:
      (fxMeta && fxMeta.expires_at) ||
      new Date(nowMs + QUOTE_TTL_MS).toISOString(),
    list_price: list,
    buyer_fee_rate: BUYER_FEE,
    seller_fee_rate: SELLER_FEE,
    buyer_pays: Math.round((list + buyerFee) * 100) / 100,
    seller_receives: Math.round((list - sellerFee) * 100) / 100,
    platform_fee: Math.round((buyerFee + sellerFee) * 100) / 100,
    display_currency: converted.currency,
    charge_currency: converted.currency,
    settlement_currency: "EUR",
    live_collection: false,
    note:
      "Quote only. Public live card collection stays OFF without Owner flags."
  };
}

module.exports = {
  fetchEurRates,
  convertMajor,
  quoteWithFees,
  isFxQuoteFresh,
  BUYER_FEE,
  SELLER_FEE,
  FX_SOURCE,
  FX_SOURCE_URL,
  FX_PROVIDER_BASIS,
  QUOTE_TTL_MS
};
