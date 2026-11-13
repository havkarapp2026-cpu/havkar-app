/*
 * Exchange rates for multi-currency quotes (EUR base).
 * Used for display/quote only. Does not enable live Stripe collection.
 */

const BUYER_FEE = 0.02;
const SELLER_FEE = 0.03;

async function fetchEurRates() {
  const url =
    "https://api.frankfurter.app/latest?from=EUR";
  const res = await fetch(url, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) {
    throw new Error("fx_provider_http_" + res.status);
  }
  const body = await res.json();
  if (!body || typeof body.rates !== "object") {
    throw new Error("fx_provider_invalid");
  }
  return {
    base: "EUR",
    date: body.date || null,
    rates: Object.assign({ EUR: 1 }, body.rates)
  };
}

function convertMajor(amountEur, currency, rates) {
  const code = String(currency || "EUR").toUpperCase();
  const rate = rates[code];
  if (!rate || !Number.isFinite(Number(rate))) {
    return { ok: false, error: "fx_rate_missing", currency: code };
  }
  const major = Math.round(Number(amountEur) * Number(rate) * 100) / 100;
  return { ok: true, currency: code, rate: Number(rate), amount: major };
}

function quoteWithFees(listPriceEur, currency, rates) {
  const converted = convertMajor(listPriceEur, currency, rates);
  if (!converted.ok) return converted;
  const list = converted.amount;
  const buyerFee = Math.round(list * BUYER_FEE * 100) / 100;
  const sellerFee = Math.round(list * SELLER_FEE * 100) / 100;
  return {
    ok: true,
    base: "EUR",
    list_price_eur: Number(listPriceEur),
    currency: converted.currency,
    fx_rate: converted.rate,
    list_price: list,
    buyer_fee_rate: BUYER_FEE,
    seller_fee_rate: SELLER_FEE,
    buyer_pays: Math.round((list + buyerFee) * 100) / 100,
    seller_receives: Math.round((list - sellerFee) * 100) / 100,
    platform_fee: Math.round((buyerFee + sellerFee) * 100) / 100,
    live_collection: false,
    note:
      "Quote only. Public live card collection stays OFF without Owner flags."
  };
}

module.exports = {
  fetchEurRates,
  convertMajor,
  quoteWithFees,
  BUYER_FEE,
  SELLER_FEE
};
