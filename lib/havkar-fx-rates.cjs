/*
 * Exchange rates for multi-currency quotes (EUR base).
 * Primary: Frankfurter (ECB reference rates) — https://www.frankfurter.app/
 * Secondary fill: ExchangeRate-API open endpoint — https://www.exchangerate-api.com
 *   (https://open.er-api.com/v6/latest/EUR) — used ONLY for codes missing from ECB.
 * Never invent rates. Missing rate → refuse conversion.
 * Quote-only. Does not enable live Stripe collection.
 */

const BUYER_FEE = 0.02;
const SELLER_FEE = 0.03;
const FX_SOURCE_PRIMARY = "frankfurter.app";
const FX_SOURCE_PRIMARY_URL = "https://api.frankfurter.app/latest?from=EUR";
const FX_PROVIDER_BASIS_PRIMARY = "ECB reference rates via Frankfurter";
const FX_SOURCE_SECONDARY = "exchangerate-api.com";
const FX_SOURCE_SECONDARY_URL = "https://open.er-api.com/v6/latest/EUR";
const FX_PROVIDER_BASIS_SECONDARY =
  "ExchangeRate-API open access endpoint (non-ECB fill only)";
/** Quote validity window for checkout conversion locks (ms). */
const QUOTE_TTL_MS = 10 * 60 * 1000;

async function fetchJson(url, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) {
    throw new Error("fx_provider_http_" + res.status);
  }
  const body = await res.json();
  return body;
}

async function fetchFrankfurterRates(fetchImpl) {
  const body = await fetchJson(FX_SOURCE_PRIMARY_URL, fetchImpl);
  if (!body || typeof body.rates !== "object") {
    throw new Error("fx_provider_invalid_frankfurter");
  }
  return {
    date: body.date || null,
    rates: Object.assign({ EUR: 1 }, body.rates),
    source: FX_SOURCE_PRIMARY,
    source_url: FX_SOURCE_PRIMARY_URL,
    provider_basis: FX_PROVIDER_BASIS_PRIMARY
  };
}

async function fetchOpenErApiRates(fetchImpl) {
  const body = await fetchJson(FX_SOURCE_SECONDARY_URL, fetchImpl);
  if (
    !body ||
    body.result !== "success" ||
    typeof body.rates !== "object"
  ) {
    throw new Error("fx_provider_invalid_exchangerate_api");
  }
  return {
    date: body.time_last_update_utc || body.time_next_update_utc || null,
    rates: Object.assign({ EUR: 1 }, body.rates),
    source: FX_SOURCE_SECONDARY,
    source_url: FX_SOURCE_SECONDARY_URL,
    provider_basis: FX_PROVIDER_BASIS_SECONDARY,
    provider_home: body.provider || "https://www.exchangerate-api.com"
  };
}

/**
 * Merge providers: prefer ECB/Frankfurter for every overlapping code.
 * Secondary fills only missing codes. No invented values.
 */
function mergeEurRateSets(primary, secondary) {
  const rates = Object.assign({}, primary.rates || {});
  const sources = { EUR: FX_SOURCE_PRIMARY };
  Object.keys(rates).forEach((code) => {
    sources[code] = FX_SOURCE_PRIMARY;
  });
  const filled = [];
  if (secondary && secondary.rates) {
    Object.keys(secondary.rates).forEach((code) => {
      const key = String(code || "").toUpperCase();
      const value = Number(secondary.rates[code]);
      if (!Number.isFinite(value) || value <= 0) return;
      if (rates[key] == null) {
        rates[key] = value;
        sources[key] = FX_SOURCE_SECONDARY;
        filled.push(key);
      }
    });
  }
  return {
    rates,
    rate_sources: sources,
    secondary_fill_count: filled.length,
    secondary_fill_sample: filled.slice(0, 20)
  };
}

async function fetchEurRates(fetchImpl = fetch, nowMs = Date.now()) {
  const primary = await fetchFrankfurterRates(fetchImpl);
  let secondary = null;
  let secondary_error = null;
  try {
    secondary = await fetchOpenErApiRates(fetchImpl);
  } catch (err) {
    secondary_error = String(err && err.message ? err.message : err);
  }
  const merged = mergeEurRateSets(primary, secondary);
  const fetchedAt = new Date(nowMs).toISOString();
  return {
    ok: true,
    base: "EUR",
    date: primary.date,
    rates: merged.rates,
    rate_sources: merged.rate_sources,
    source: secondary
      ? FX_SOURCE_PRIMARY + "+" + FX_SOURCE_SECONDARY
      : FX_SOURCE_PRIMARY,
    sources: {
      primary: {
        source: primary.source,
        source_url: primary.source_url,
        provider_basis: primary.provider_basis,
        date: primary.date,
        rate_count: Object.keys(primary.rates).length
      },
      secondary: secondary
        ? {
            source: secondary.source,
            source_url: secondary.source_url,
            provider_basis: secondary.provider_basis,
            provider_home: secondary.provider_home || null,
            date: secondary.date,
            rate_count: Object.keys(secondary.rates).length,
            fill_count: merged.secondary_fill_count,
            fill_sample: merged.secondary_fill_sample
          }
        : {
            source: FX_SOURCE_SECONDARY,
            available: false,
            error: secondary_error
          }
    },
    source_url: FX_SOURCE_PRIMARY_URL,
    provider_basis: secondary
      ? FX_PROVIDER_BASIS_PRIMARY + "; secondary fill " + FX_PROVIDER_BASIS_SECONDARY
      : FX_PROVIDER_BASIS_PRIMARY,
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

function convertMajor(amountEur, currency, rates, rateSources) {
  const code = String(currency || "EUR").toUpperCase();
  const rate = rates && rates[code];
  if (!rate || !Number.isFinite(Number(rate))) {
    return { ok: false, error: "fx_rate_missing", currency: code };
  }
  let decimals = 2;
  try {
    const { getCurrencyMeta } = require("./stripe-supported-currencies-60.cjs");
    const meta = getCurrencyMeta(code);
    if (meta && Number.isFinite(Number(meta.decimals))) {
      decimals = Number(meta.decimals);
    }
  } catch (_e) {
    decimals = 2;
  }
  const factor = Math.pow(10, decimals);
  const major = Math.round(Number(amountEur) * Number(rate) * factor) / factor;
  return {
    ok: true,
    currency: code,
    decimals: decimals,
    rate: Number(rate),
    amount: major,
    rate_source:
      (rateSources && rateSources[code]) ||
      (code === "EUR" ? FX_SOURCE_PRIMARY : null)
  };
}

function moneyMajor(amount, decimals) {
  const places = Number.isFinite(Number(decimals)) ? Number(decimals) : 2;
  const factor = Math.pow(10, places);
  return Math.round(Number(amount) * factor) / factor;
}

function quoteWithFees(listPriceEur, currency, rates, fxMeta = null) {
  if (fxMeta && fxMeta.expires_at && !isFxQuoteFresh(fxMeta)) {
    return {
      ok: false,
      error: "fx_quote_expired",
      currency: String(currency || "EUR").toUpperCase(),
      expires_at: fxMeta.expires_at,
      source: fxMeta.source || FX_SOURCE_PRIMARY
    };
  }
  const converted = convertMajor(
    listPriceEur,
    currency,
    rates,
    fxMeta && fxMeta.rate_sources
  );
  if (!converted.ok) return converted;
  let decimals = 2;
  try {
    const { getCurrencyMeta } = require("./stripe-supported-currencies-60.cjs");
    const meta = getCurrencyMeta(converted.currency);
    if (meta && Number.isFinite(Number(meta.decimals))) {
      decimals = Number(meta.decimals);
    }
  } catch (_e) {
    decimals = 2;
  }
  const list = moneyMajor(converted.amount, decimals);
  const buyerFee = moneyMajor(list * BUYER_FEE, decimals);
  const sellerFee = moneyMajor(list * SELLER_FEE, decimals);
  const nowMs = Date.now();
  return {
    ok: true,
    base: "EUR",
    list_price_eur: Number(listPriceEur),
    currency: converted.currency,
    decimals: decimals,
    zero_decimal: decimals === 0,
    fx_rate: converted.rate,
    fx_date: (fxMeta && fxMeta.date) || null,
    fx_source: converted.rate_source || (fxMeta && fxMeta.source) || FX_SOURCE_PRIMARY,
    fx_source_url: (fxMeta && fxMeta.source_url) || FX_SOURCE_PRIMARY_URL,
    fx_provider_basis: (fxMeta && fxMeta.provider_basis) || FX_PROVIDER_BASIS_PRIMARY,
    fx_fetched_at: (fxMeta && fxMeta.fetched_at) || null,
    fx_expires_at:
      (fxMeta && fxMeta.expires_at) ||
      new Date(nowMs + QUOTE_TTL_MS).toISOString(),
    list_price: list,
    buyer_fee_rate: BUYER_FEE,
    seller_fee_rate: SELLER_FEE,
    buyer_pays: moneyMajor(list + buyerFee, decimals),
    seller_receives: moneyMajor(list - sellerFee, decimals),
    platform_fee: moneyMajor(buyerFee + sellerFee, decimals),
    display_currency: converted.currency,
    charge_currency: converted.currency,
    settlement_currency: "EUR",
    live_collection: false,
    note:
      "Quote only. Public live card collection stays OFF without Owner flags."
  };
}

function coverageAgainstPresentment(presentmentCodes, fx) {
  const codes = Array.isArray(presentmentCodes)
    ? presentmentCodes.map((c) => String(c).toUpperCase())
    : [];
  const rates = (fx && fx.rates) || {};
  const covered = [];
  const missing = [];
  codes.forEach((code) => {
    if (code === "EUR" || (rates[code] != null && Number(rates[code]) > 0)) {
      covered.push(code);
    } else {
      missing.push(code);
    }
  });
  return {
    presentment_count: codes.length,
    covered_count: covered.length,
    missing_count: missing.length,
    missing_sample: missing.slice(0, 30),
    coverage_ratio:
      codes.length > 0 ? Math.round((covered.length / codes.length) * 1000) / 1000 : 0
  };
}

module.exports = {
  fetchEurRates,
  fetchFrankfurterRates,
  fetchOpenErApiRates,
  mergeEurRateSets,
  convertMajor,
  quoteWithFees,
  isFxQuoteFresh,
  coverageAgainstPresentment,
  BUYER_FEE,
  SELLER_FEE,
  FX_SOURCE: FX_SOURCE_PRIMARY,
  FX_SOURCE_PRIMARY,
  FX_SOURCE_PRIMARY_URL,
  FX_PROVIDER_BASIS: FX_PROVIDER_BASIS_PRIMARY,
  FX_SOURCE_SECONDARY,
  FX_SOURCE_SECONDARY_URL,
  FX_PROVIDER_BASIS_SECONDARY,
  QUOTE_TTL_MS
};
