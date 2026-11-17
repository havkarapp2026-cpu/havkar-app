/**
 * Omio partner adapter (train/bus/ferry).
 * Implements search/booking workflow surfaces without fabricating inventory.
 * Live HTTP search runs only when OMIO_API_KEY + HAVKAR_OMIO_API_ENABLED +
 * HAVKAR_OMIO_CONTRACT_VERIFIED are all present. Booking stays separately gated.
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
 * Official Omio affiliate tracked search URL (not a fabricated fare API).
 * Uses partner affiliate id when configured; never invents journeys.
 */
function buildOmioAffiliateSearchUrl(query = {}, env = process.env) {
  const id = affiliateId(env);
  if (!id) {
    return {
      ok: false,
      error: "missing_OMIO_AFFILIATE_ID",
      url: null,
      note: "Affiliate relationship exists, but the affiliate id secret is not bound in this environment."
    };
  }
  const q = normalizeQuery(query);
  const url = new URL("https://www.omio.com/search");
  if (q.from) url.searchParams.set("departure", q.from);
  if (q.to) url.searchParams.set("arrival", q.to);
  if (q.date) url.searchParams.set("departureDate", q.date);
  if (q.mode && q.mode !== "train") url.searchParams.set("transportTypes", q.mode);
  url.searchParams.set("partner", id);
  url.searchParams.set("utm_source", "havkar");
  url.searchParams.set("utm_medium", "affiliate");
  return {
    ok: true,
    url: url.toString(),
    partner: id,
    mode: q.mode,
    honesty: "Opens Omio affiliate search; HAVKAR does not invent fares."
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
    affiliate_search_ready: Boolean(aff),
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
      !aff ? "Bind OMIO_AFFILIATE_ID (or HAVKAR_OMIO_AFFILIATE_ID) for tracked affiliate search links" : null,
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
    return {
      ok: false,
      action: "omio_search",
      results: [],
      error: "omio_blocked",
      status,
      honesty: "No Omio journeys are fabricated.",
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
