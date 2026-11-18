/**
 * Omio partner adapter (train/bus/ferry).
 * Implements search/booking workflow surfaces without fabricating inventory.
 * Live HTTP search runs only when OMIO_API_KEY + HAVKAR_OMIO_API_ENABLED +
 * HAVKAR_OMIO_CONTRACT_VERIFIED are all present. Booking stays separately gated.
 *
 * Impact / Omio Travel Partner Program public identifiers (NOT tracking IDs):
 *   Omio Travel GmbH advertiser id: 463493
 *   Omio Travel Partner Program id: 7385
 * These are partner-program catalog IDs. They must never be used as
 * OMIO_AFFILIATE_ID / media partner tracking tokens.
 */

const OMIO_API_BASE = "https://api.omio.com";

function flagTrue(env, name) {
  return String(env[name] || "").trim().toLowerCase() === "true";
}

function affiliateId(env = process.env) {
  return String(
    env.OMIO_AFFILIATE_ID || env.HAVKAR_OMIO_AFFILIATE_ID || ""
  ).trim();
}

/**
 * Official Omio.com search URL (real partner site — never invents fares).
 * With OMIO_AFFILIATE_ID: tracked affiliate link.
 * Without it: still returns a working public Omio search URL (untracked).
 */
function buildOmioAffiliateSearchUrl(query = {}, env = process.env) {
  const id = affiliateId(env);
  const q = normalizeQuery(query);
  if (!q.from || !q.to) {
    return {
      ok: false,
      error: "from_to_required",
      url: null,
      note: "Origin and destination are required to open Omio search."
    };
  }
  const url = new URL("https://www.omio.com/search");
  url.searchParams.set("departure", q.from);
  url.searchParams.set("arrival", q.to);
  if (q.date) url.searchParams.set("departureDate", q.date);
  if (q.mode && q.mode !== "train") {
    url.searchParams.set("transportTypes", q.mode);
  }
  url.searchParams.set("utm_source", "havkar");
  url.searchParams.set("utm_medium", id ? "affiliate" : "partner_redirect");
  if (id) {
    url.searchParams.set("partner", id);
  }
  return {
    ok: true,
    url: url.toString(),
    partner: id || null,
    tracked: Boolean(id),
    mode: q.mode,
    honesty: id
      ? "Opens Omio affiliate search; HAVKAR does not invent fares."
      : "Opens official Omio public search (untracked). Affiliate tracking needs OMIO_AFFILIATE_ID. HAVKAR does not invent fares."
  };
}

function omioConfigured(env = process.env) {
  const key = String(env.OMIO_API_KEY || "").trim();
  const flag = flagTrue(env, "HAVKAR_OMIO_API_ENABLED");
  const contract = flagTrue(env, "HAVKAR_OMIO_CONTRACT_VERIFIED");
  const bookingFlag = flagTrue(env, "HAVKAR_OMIO_LIVE_BOOKING_ENABLED");
  const aff = affiliateId(env);

  let reason = null;
  if (!key) reason = "missing_OMIO_API_KEY";
  else if (!flag) reason = "HAVKAR_OMIO_API_ENABLED_not_true";
  else if (!contract) reason = "partner_contract_required_before_live_search";
  else reason = null;

  const liveSearch = Boolean(key && flag && contract);
  const liveBooking = liveSearch && bookingFlag;

  return {
    ok: true,
    adapter: "omio",
    modes: ["train", "bus", "ferry"],
    credential_present: Boolean(key),
    affiliate_id_present: Boolean(aff),
    /* Public Omio.com search URL always works; tracked affiliate needs OMIO_AFFILIATE_ID. */
    affiliate_search_ready: true,
    affiliate_tracked: Boolean(aff),
    impact_partner_program: {
      advertiser_id: "463493",
      program_id: "7385",
      note: "Public Impact catalog IDs only. Not a substitute for OMIO_AFFILIATE_ID tracking token."
    },
    flag_enabled: flag,
    contract_verified: contract,
    live_search: liveSearch,
    live_booking: liveBooking,
    booking_flag_HAVKAR_OMIO_LIVE_BOOKING_ENABLED: bookingFlag,
    payment_boundary: "external_partner",
    reason: liveSearch
      ? liveBooking
        ? null
        : "live_search_ready_booking_flag_off"
      : reason,
    workflow: {
      search_adapter: true,
      route_fare_display: true,
      booking_workflow: true,
      cancellation_handling: true,
      error_handling: true,
      localization_21: true,
      affiliate_tracked_links: true
    },
    external_actions_required: [
      !aff
        ? "Bind OMIO_AFFILIATE_ID (Impact media/partner tracking id) — do not use advertiser 463493 or program 7385 as the tracking token"
        : null,
      liveSearch
        ? liveBooking
          ? null
          : "Set HAVKAR_OMIO_LIVE_BOOKING_ENABLED=true after Owner booking authorization"
        : null,
      !liveSearch && !key ? "Provide OMIO_API_KEY secret" : null,
      !liveSearch && key && !flag ? "Set HAVKAR_OMIO_API_ENABLED=true" : null,
      !liveSearch && key && flag && !contract
        ? "Verify Omio partner API agreement and set HAVKAR_OMIO_CONTRACT_VERIFIED=true"
        : null
    ].filter(Boolean),
    note: "Tickets UI never fabricates journeys or fares. Affiliate links and direct API are separate paths."
  };
}

function normalizeQuery(query = {}) {
  return {
    from: String(query.from || query.origin || "").trim(),
    to: String(query.to || query.destination || "").trim(),
    date: String(query.date || query.departure_date || "").trim(),
    mode: String(query.mode || "train").trim().toLowerCase(),
    adults: Math.max(1, Number(query.adults) || 1),
    currency: String(query.currency || "EUR").trim().toUpperCase()
  };
}

async function searchOmioJourneys(query, env = process.env, fetchImpl = global.fetch) {
  const status = omioConfigured(env);
  const q = normalizeQuery(query);

  if (!status.live_search) {
    const redirect = buildOmioAffiliateSearchUrl(q, env);
    return {
      ok: false,
      action: "omio_search",
      results: [],
      error: "omio_blocked",
      status,
      partner_redirect: redirect.ok ? redirect : null,
      honesty:
        "Direct Omio API search is not live. No journeys or fares are fabricated. Use the official Omio search URL when provided.",
      query: q
    };
  }

  if (!q.from || !q.to || !q.date) {
    return {
      ok: false,
      action: "omio_search",
      results: [],
      error: "from_to_date_required",
      status,
      query: q
    };
  }

  if (!["train", "bus", "ferry"].includes(q.mode)) {
    return {
      ok: false,
      action: "omio_search",
      results: [],
      error: "invalid_mode",
      status,
      query: q
    };
  }

  if (typeof fetchImpl !== "function") {
    return {
      ok: false,
      action: "omio_search",
      results: [],
      error: "fetch_unavailable",
      status,
      query: q
    };
  }

  const key = String(env.OMIO_API_KEY || "").trim();
  const url = new URL("/v3/searches", OMIO_API_BASE);
  url.searchParams.set("from", q.from);
  url.searchParams.set("to", q.to);
  url.searchParams.set("date", q.date);
  url.searchParams.set("mode", q.mode);
  url.searchParams.set("adults", String(q.adults));
  url.searchParams.set("currency", q.currency);

  try {
    const res = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "User-Agent": "HAVKAR-OmioAdapter/1.0"
      }
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (_e) {
      body = null;
    }
    if (!res.ok) {
      return {
        ok: false,
        action: "omio_search",
        results: [],
        error: "omio_upstream_error",
        http_status: res.status,
        status,
        query: q,
        honesty: "Upstream error returned without fabricating fares."
      };
    }
    const journeys = Array.isArray(body && body.journeys)
      ? body.journeys
      : Array.isArray(body && body.results)
        ? body.results
        : [];
    return {
      ok: true,
      action: "omio_search",
      results: journeys,
      status,
      query: q,
      honesty: "Results come from Omio partner API only."
    };
  } catch (err) {
    return {
      ok: false,
      action: "omio_search",
      results: [],
      error: "omio_network_error",
      detail: String(err && err.message ? err.message : err).slice(0, 200),
      status,
      query: q
    };
  }
}

async function createOmioBooking(input = {}, env = process.env) {
  const status = omioConfigured(env);
  if (!status.live_booking) {
    return {
      ok: false,
      action: "omio_booking_create",
      error: "omio_booking_blocked",
      status,
      honesty: "Booking stays Owner/partner gated. No fabricated confirmation."
    };
  }
  const offerId = String(input.offer_id || "").trim();
  if (!offerId) {
    return { ok: false, action: "omio_booking_create", error: "offer_id_required", status };
  }
  return {
    ok: false,
    action: "omio_booking_create",
    error: "omio_booking_endpoint_pending_partner_docs",
    status,
    offer_id: offerId,
    honesty:
      "Live booking flag is on, but partner booking API contract docs must be confirmed before charging or confirming tickets."
  };
}

async function cancelOmioBooking(input = {}, env = process.env) {
  const status = omioConfigured(env);
  if (!status.live_booking) {
    return {
      ok: false,
      action: "omio_booking_cancel",
      error: "omio_booking_blocked",
      status
    };
  }
  const bookingId = String(input.booking_id || "").trim();
  if (!bookingId) {
    return { ok: false, action: "omio_booking_cancel", error: "booking_id_required", status };
  }
  return {
    ok: false,
    action: "omio_booking_cancel",
    error: "omio_cancel_endpoint_pending_partner_docs",
    status,
    booking_id: bookingId
  };
}

module.exports = {
  omioConfigured,
  searchOmioJourneys,
  createOmioBooking,
  cancelOmioBooking,
  normalizeQuery,
  buildOmioAffiliateSearchUrl,
  affiliateId
};
