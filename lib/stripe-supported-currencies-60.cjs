/*
 * Exactly 60 Stripe presentment currencies verified against
 * https://docs.stripe.com/currencies (US account presentment list).
 * Live collection remains gated by HAVKAR_REAL_PAYMENTS_ENABLED /
 * HAVKAR_STRIPE_LIVE_ENABLED — this matrix alone does not enable live pay.
 */

const ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf"
]);

/** Special: API expects two-decimal with trailing 00 (ISK, UGX). */
const SPECIAL_TWO_DECIMAL_ZERO = new Set(["isk", "ugx"]);

/**
 * Individually listed against Stripe presentment currencies.
 * decimals: Stripe API minor-unit exponent used by HAVKAR helpers.
 * min_major: documented Stripe minimum where available; otherwise conservative.
 */
const CURRENCIES_60 = Object.freeze([
  { code: "usd", name: "US Dollar", symbol: "$", decimals: 2, min_major: 0.5 },
  { code: "eur", name: "Euro", symbol: "€", decimals: 2, min_major: 0.5 },
  { code: "gbp", name: "British Pound", symbol: "£", decimals: 2, min_major: 0.3 },
  { code: "cad", name: "Canadian Dollar", symbol: "CA$", decimals: 2, min_major: 0.5 },
  { code: "aud", name: "Australian Dollar", symbol: "A$", decimals: 2, min_major: 0.5 },
  { code: "jpy", name: "Japanese Yen", symbol: "¥", decimals: 0, min_major: 50 },
  { code: "chf", name: "Swiss Franc", symbol: "CHF", decimals: 2, min_major: 0.5 },
  { code: "sek", name: "Swedish Krona", symbol: "kr", decimals: 2, min_major: 3 },
  { code: "nok", name: "Norwegian Krone", symbol: "kr", decimals: 2, min_major: 3 },
  { code: "dkk", name: "Danish Krone", symbol: "kr", decimals: 2, min_major: 2.5 },
  { code: "pln", name: "Polish Złoty", symbol: "zł", decimals: 2, min_major: 2 },
  { code: "czk", name: "Czech Koruna", symbol: "Kč", decimals: 2, min_major: 15 },
  { code: "huf", name: "Hungarian Forint", symbol: "Ft", decimals: 2, min_major: 175 },
  { code: "ron", name: "Romanian Leu", symbol: "lei", decimals: 2, min_major: 2 },
  { code: "bgn", name: "Bulgarian Lev", symbol: "лв", decimals: 2, min_major: 1 },
  { code: "try", name: "Turkish Lira", symbol: "₺", decimals: 2, min_major: 0.5 },
  { code: "mxn", name: "Mexican Peso", symbol: "MX$", decimals: 2, min_major: 10 },
  { code: "brl", name: "Brazilian Real", symbol: "R$", decimals: 2, min_major: 0.5 },
  { code: "ars", name: "Argentine Peso", symbol: "AR$", decimals: 2, min_major: 0.5 },
  { code: "clp", name: "Chilean Peso", symbol: "CLP", decimals: 0, min_major: 50 },
  { code: "cop", name: "Colombian Peso", symbol: "COP", decimals: 2, min_major: 0.5 },
  { code: "pen", name: "Peruvian Sol", symbol: "S/", decimals: 2, min_major: 0.5 },
  { code: "uyu", name: "Uruguayan Peso", symbol: "$U", decimals: 2, min_major: 0.5 },
  { code: "inr", name: "Indian Rupee", symbol: "₹", decimals: 2, min_major: 0.5 },
  { code: "idr", name: "Indonesian Rupiah", symbol: "Rp", decimals: 2, min_major: 0.5 },
  { code: "php", name: "Philippine Peso", symbol: "₱", decimals: 2, min_major: 0.5 },
  { code: "thb", name: "Thai Baht", symbol: "฿", decimals: 2, min_major: 10 },
  { code: "vnd", name: "Vietnamese Dong", symbol: "₫", decimals: 0, min_major: 10000 },
  { code: "myr", name: "Malaysian Ringgit", symbol: "RM", decimals: 2, min_major: 2 },
  { code: "sgd", name: "Singapore Dollar", symbol: "S$", decimals: 2, min_major: 0.5 },
  { code: "hkd", name: "Hong Kong Dollar", symbol: "HK$", decimals: 2, min_major: 4 },
  { code: "twd", name: "New Taiwan Dollar", symbol: "NT$", decimals: 2, min_major: 10 },
  { code: "krw", name: "South Korean Won", symbol: "₩", decimals: 0, min_major: 50 },
  { code: "cny", name: "Chinese Yuan", symbol: "CN¥", decimals: 2, min_major: 0.5 },
  { code: "aed", name: "UAE Dirham", symbol: "د.إ", decimals: 2, min_major: 2 },
  { code: "sar", name: "Saudi Riyal", symbol: "﷼", decimals: 2, min_major: 2 },
  { code: "qar", name: "Qatari Riyal", symbol: "ر.ق", decimals: 2, min_major: 2 },
  { code: "ils", name: "Israeli Shekel", symbol: "₪", decimals: 2, min_major: 0.5 },
  { code: "zar", name: "South African Rand", symbol: "R", decimals: 2, min_major: 0.5 },
  { code: "ngn", name: "Nigerian Naira", symbol: "₦", decimals: 2, min_major: 50 },
  { code: "kes", name: "Kenyan Shilling", symbol: "KSh", decimals: 2, min_major: 50 },
  { code: "egp", name: "Egyptian Pound", symbol: "E£", decimals: 2, min_major: 5 },
  { code: "mad", name: "Moroccan Dirham", symbol: "MAD", decimals: 2, min_major: 5 },
  { code: "nzd", name: "New Zealand Dollar", symbol: "NZ$", decimals: 2, min_major: 0.5 },
  { code: "pkr", name: "Pakistani Rupee", symbol: "₨", decimals: 2, min_major: 50 },
  { code: "bdt", name: "Bangladeshi Taka", symbol: "৳", decimals: 2, min_major: 50 },
  { code: "lkr", name: "Sri Lankan Rupee", symbol: "Rs", decimals: 2, min_major: 50 },
  { code: "uah", name: "Ukrainian Hryvnia", symbol: "₴", decimals: 2, min_major: 15 },
  { code: "gel", name: "Georgian Lari", symbol: "₾", decimals: 2, min_major: 1 },
  { code: "kzt", name: "Kazakhstani Tenge", symbol: "₸", decimals: 2, min_major: 200 },
  { code: "amd", name: "Armenian Dram", symbol: "֏", decimals: 2, min_major: 200 },
  { code: "azn", name: "Azerbaijani Manat", symbol: "₼", decimals: 2, min_major: 1 },
  { code: "isk", name: "Icelandic Króna", symbol: "kr", decimals: 2, min_major: 100 },
  { code: "rsd", name: "Serbian Dinar", symbol: "дин.", decimals: 2, min_major: 50 },
  { code: "rub", name: "Russian Ruble", symbol: "₽", decimals: 2, min_major: 0.5 },
  { code: "dop", name: "Dominican Peso", symbol: "RD$", decimals: 2, min_major: 25 },
  { code: "crc", name: "Costa Rican Colón", symbol: "₡", decimals: 2, min_major: 500 },
  { code: "gtq", name: "Guatemalan Quetzal", symbol: "Q", decimals: 2, min_major: 5 },
  { code: "bob", name: "Bolivian Boliviano", symbol: "Bs", decimals: 2, min_major: 5 },
  { code: "xcd", name: "East Caribbean Dollar", symbol: "EC$", decimals: 2, min_major: 1 }
]);

if (CURRENCIES_60.length !== 60) {
  throw new Error("CURRENCIES_60_LENGTH_" + CURRENCIES_60.length);
}

const BY_CODE = Object.freeze(
  Object.fromEntries(CURRENCIES_60.map((row) => [row.code, row]))
);

function listStripeCurrencies60() {
  return CURRENCIES_60.map((row) => ({
    ...row,
    zero_decimal: ZERO_DECIMAL.has(row.code),
    special_two_decimal_zero: SPECIAL_TWO_DECIMAL_ZERO.has(row.code),
    stripe_presentment_verified: true,
    source: "https://docs.stripe.com/currencies"
  }));
}

function getCurrencyMeta(code) {
  const key = String(code || "").trim().toLowerCase();
  return BY_CODE[key] || null;
}

function isSupportedCheckoutCurrency(code) {
  return Boolean(getCurrencyMeta(code));
}

function toMinorUnits(amountMajor, code) {
  const meta = getCurrencyMeta(code);
  if (!meta) {
    return { ok: false, error: "unsupported_currency" };
  }
  const major = Number(amountMajor);
  if (!Number.isFinite(major) || major < 0) {
    return { ok: false, error: "invalid_amount" };
  }
  if (SPECIAL_TWO_DECIMAL_ZERO.has(meta.code)) {
    const whole = Math.round(major);
    return { ok: true, amount_minor: whole * 100, currency: meta.code };
  }
  if (meta.decimals === 0) {
    return { ok: true, amount_minor: Math.round(major), currency: meta.code };
  }
  const factor = 10 ** meta.decimals;
  return {
    ok: true,
    amount_minor: Math.round(major * factor),
    currency: meta.code
  };
}

function applyBuyerSellerFeesMajor(listMajor) {
  const list = Number(listMajor);
  if (!Number.isFinite(list) || list < 0) {
    return { ok: false, error: "invalid_list_price" };
  }
  const buyerFee = Math.round(list * 0.02 * 100) / 100;
  const sellerFee = Math.round(list * 0.03 * 100) / 100;
  return {
    ok: true,
    list_price: list,
    buyer_fee_rate: 0.02,
    seller_fee_rate: 0.03,
    buyer_pays: Math.round((list + buyerFee) * 100) / 100,
    seller_receives: Math.round((list - sellerFee) * 100) / 100,
    platform_fee: Math.round((buyerFee + sellerFee) * 100) / 100
  };
}

module.exports = {
  CURRENCIES_60,
  ZERO_DECIMAL,
  SPECIAL_TWO_DECIMAL_ZERO,
  listStripeCurrencies60,
  getCurrencyMeta,
  isSupportedCheckoutCurrency,
  toMinorUnits,
  applyBuyerSellerFeesMajor
};
