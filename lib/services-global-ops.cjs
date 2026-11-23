/**
 * HAVKAR Services global operations helpers.
 * Connect countries, availability, refund planning — no live money movement here.
 */

"use strict";

/**
 * Stripe Connect Express / recipient countries commonly supported for platforms.
 * Server allowlist only — never trust client country alone.
 * Source: Stripe Connect supported countries for Express-style accounts (EU + major).
 */
const STRIPE_CONNECT_EXPRESS_COUNTRIES = Object.freeze([
  { code: "AT", currency: "EUR", name: "Austria" },
  { code: "AU", currency: "AUD", name: "Australia" },
  { code: "BE", currency: "EUR", name: "Belgium" },
  { code: "BG", currency: "BGN", name: "Bulgaria" },
  { code: "CA", currency: "CAD", name: "Canada" },
  { code: "CH", currency: "CHF", name: "Switzerland" },
  { code: "CY", currency: "EUR", name: "Cyprus" },
  { code: "CZ", currency: "CZK", name: "Czech Republic" },
  { code: "DE", currency: "EUR", name: "Germany" },
  { code: "DK", currency: "DKK", name: "Denmark" },
  { code: "EE", currency: "EUR", name: "Estonia" },
  { code: "ES", currency: "EUR", name: "Spain" },
  { code: "FI", currency: "EUR", name: "Finland" },
  { code: "FR", currency: "EUR", name: "France" },
  { code: "GB", currency: "GBP", name: "United Kingdom" },
  { code: "GI", currency: "GBP", name: "Gibraltar" },
  { code: "GR", currency: "EUR", name: "Greece" },
  { code: "HK", currency: "HKD", name: "Hong Kong" },
  { code: "HR", currency: "EUR", name: "Croatia" },
  { code: "HU", currency: "HUF", name: "Hungary" },
  { code: "IE", currency: "EUR", name: "Ireland" },
  { code: "IT", currency: "EUR", name: "Italy" },
  { code: "JP", currency: "JPY", name: "Japan" },
  { code: "LI", currency: "CHF", name: "Liechtenstein" },
  { code: "LT", currency: "EUR", name: "Lithuania" },
  { code: "LU", currency: "EUR", name: "Luxembourg" },
  { code: "LV", currency: "EUR", name: "Latvia" },
  { code: "MT", currency: "EUR", name: "Malta" },
  { code: "MX", currency: "MXN", name: "Mexico" },
  { code: "NL", currency: "EUR", name: "Netherlands" },
  { code: "NO", currency: "NOK", name: "Norway" },
  { code: "NZ", currency: "NZD", name: "New Zealand" },
  { code: "PL", currency: "PLN", name: "Poland" },
  { code: "PT", currency: "EUR", name: "Portugal" },
  { code: "RO", currency: "RON", name: "Romania" },
  { code: "SE", currency: "SEK", name: "Sweden" },
  { code: "SG", currency: "SGD", name: "Singapore" },
  { code: "SI", currency: "EUR", name: "Slovenia" },
  { code: "SK", currency: "EUR", name: "Slovakia" },
  { code: "TH", currency: "THB", name: "Thailand" },
  { code: "US", currency: "USD", name: "United States" }
]);

const LICENSED_SERVICE_CATEGORIES = Object.freeze([
  "Electrical",
  "Plumbing",
  "Auto Services",
  "Health",
  "Medical",
  "Legal",
  "Accounting"
]);

function normalizeCountryCode(raw) {
  const code = String(raw || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return code;
}

function findConnectCountry(raw) {
  const code = normalizeCountryCode(raw);
  if (!code) return null;
  return STRIPE_CONNECT_EXPRESS_COUNTRIES.find((row) => row.code === code) || null;
}

function assertConnectCountryAllowed(raw) {
  const row = findConnectCountry(raw);
  if (!row) {
    return {
      ok: false,
      code: "CONNECT_COUNTRY_NOT_ALLOWED",
      error:
        "This country is not on the HAVKAR Stripe Connect allowlist. Choose a supported country."
    };
  }
  return { ok: true, country: row };
}

function timeToMinutes(value) {
  const text = String(value || "").trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function slotOverlaps(slotStart, slotEnd, bookingTime) {
  const start = timeToMinutes(slotStart);
  const end = timeToMinutes(slotEnd);
  const book = timeToMinutes(bookingTime);
  if (start == null || end == null || book == null) return false;
  return book >= start && book < end;
}

function categoryRequiresLicense(category) {
  const label = String(category || "").trim();
  return LICENSED_SERVICE_CATEGORIES.some(
    (item) => item.toLowerCase() === label.toLowerCase()
  );
}

function planServiceRefund(input) {
  const source = input || {};
  const agreedCents = Number(source.agreedCents);
  const commissionCents = Number(source.commissionCents);
  const providerSettlementCents = Number(source.providerSettlementCents);
  const refundCents =
    source.refundCents == null ? agreedCents : Number(source.refundCents);
  if (
    !Number.isInteger(agreedCents) ||
    agreedCents <= 0 ||
    !Number.isInteger(commissionCents) ||
    !Number.isInteger(providerSettlementCents) ||
    !Number.isInteger(refundCents) ||
    refundCents <= 0 ||
    refundCents > agreedCents
  ) {
    return { ok: false, reason: "invalid_refund_amounts" };
  }
  if (commissionCents + providerSettlementCents !== agreedCents) {
    return { ok: false, reason: "split_mismatch" };
  }
  const ratio = refundCents / agreedCents;
  const refundCommission = Math.round(commissionCents * ratio);
  const refundProvider = refundCents - refundCommission;
  return {
    ok: true,
    refund_cents: refundCents,
    refund_commission_cents: refundCommission,
    refund_provider_settlement_cents: refundProvider,
    remaining_customer_cents: agreedCents - refundCents,
    currency: String(source.currency || "eur").toLowerCase(),
    requires_owner_approval: true,
    executes_stripe_refund: false
  };
}

function staffServicesPanelSafe(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map(function (row) {
    return {
      id: row.id,
      booking_id: row.booking_id,
      status: row.status,
      category: row.category,
      created_at: row.created_at,
      provider_id: row.provider_id || null,
      customer_id: row.customer_id || null
    };
  });
}

module.exports = {
  STRIPE_CONNECT_EXPRESS_COUNTRIES,
  LICENSED_SERVICE_CATEGORIES,
  normalizeCountryCode,
  findConnectCountry,
  assertConnectCountryAllowed,
  timeToMinutes,
  slotOverlaps,
  categoryRequiresLicense,
  planServiceRefund,
  staffServicesPanelSafe
};
