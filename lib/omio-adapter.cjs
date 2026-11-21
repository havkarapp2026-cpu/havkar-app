/**
 * Omio partner adapter (train/bus/ferry).
 * Implements search/booking workflow surfaces without fabricating inventory.
 * Live HTTP search runs only when OMIO_API_KEY + HAVKAR_OMIO_API_ENABLED +
 * HAVKAR_OMIO_CONTRACT_VERIFIED are all present. Booking stays separately gated.
 *
 * Impact catalog (NOT media-partner tracking tokens):
 *   Omio Travel GmbH advertiser id: 463493
 *   Omio Travel Partner Program id: 7385
 *
 * HAVKAR Impact media / account partner id (tracking):
 *   7763968  → bind as OMIO_AFFILIATE_ID / HAVKAR_OMIO_AFFILIATE_ID
 * Having an affiliate id enables click attribution on Omio redirects only.
 * It does NOT activate Omio inventory API or in-app ticket sales.
 */

const OMIO_API_BASE = "https://api.omio.com";

/** Impact catalog ids that must never be used as OMIO_AFFILIATE_ID. */
const FORBIDDEN_AFFILIATE_IDS = new Set(["463493", "7385"]);

/** Owner-confirmed HAVKAR Impact media partner account id. */
const HAVKAR_IMPACT_MEDIA_PARTNER_ID = "7763968";

function flagTrue(env, name) {
  return String(env[name] || "").trim().toLowerCase() === "true";
}

function affiliateId(env = process.env) {
  const raw = String(
    env.OMIO_AFFILIATE_ID || env.HAVKAR_OMIO_AFFILIATE_ID || ""
  ).trim();
  if (!raw) return "";
  if (FORBIDDEN_AFFILIATE_IDS.has(raw)) {
    return "";
  }
  return raw;
}

const SURFACE_MODES = ["train", "bus", "ferry", "all", "multimodal"];

/**
 * Slug for Rome2Rio public map URLs (city/country free text → path segment).
 * Never invents routes — only builds the official search path.
 */
function rome2rioSlug(place) {
  return String(place || "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Official Rome2Rio combined-route explorer (train/bus/ferry/flight mix on their site).
 * HAVKAR does not invent connections; the partner site computes real options.
 */
function buildRome2RioSearchUrl(query = {}) {
  const q = normalizeQuery(query);
  if (!q.from || !q.to) {
    return {
      ok: false,
      error: "from_to_required",
      url: null,
      note: "Origin and destination are required to open Rome2Rio."
    };
  }
  const fromSlug = rome2rioSlug(q.from);
  const toSlug = rome2rioSlug(q.to);
  if (!fromSlug || !toSlug) {
    return {
      ok: false,
      error: "invalid_place",
      url: null
    };
  }
  const url =
    "https://www.rome2rio.com/map/" +
    encodeURIComponent(fromSlug) +
    "/" +
    encodeURIComponent(toSlug);
  return {
    ok: true,
    url: url,
    provider: "rome2rio",
    mode: q.mode || "all",
    honesty:
      "Opens official Rome2Rio combined travel search. HAVKAR does not invent multimodal itineraries or fares."
  };
}

/**
 * Official Omio.com search URL (real partner site — never invents fares).
 * Worldwide city/country free-text is accepted; Omio resolves coverage on their site.
 * mode=all|multimodal → no transportTypes filter (combined surface modes).
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
  if (q.adults > 1) url.searchParams.set("adults", String(q.adults));
  if (q.mode === "train" || q.mode === "bus" || q.mode === "ferry") {
    url.searchParams.set("transportTypes", q.mode);
  }
  /* all / multimodal: omit transportTypes so Omio can show combined surface options */
  url.searchParams.set("utm_source", "havkar");
  url.searchParams.set("utm_medium", id ? "affiliate" : "partner_redirect");
  if (id) {
    url.searchParams.set("partner", id);
    /* Impact-friendly attribution hints (public params, not secrets). */
    url.searchParams.set("utm_campaign", "omio_impact_" + id);
  }
  return {
    ok: true,
    url: url.toString(),
    partner: id || null,
    tracked: Boolean(id),
    impact: {
      media_partner_id_expected: HAVKAR_IMPACT_MEDIA_PARTNER_ID,
      program_id: "7385",
      advertiser_id: "463493",
      tracking_active: Boolean(id),
      note:
        "Affiliate tracking attributes eligible Omio bookings to the Impact media partner when partner= is set. Not Omio API sales."
    },
    mode: q.mode,
    scope: "global",
    honesty: id
      ? "Opens tracked Omio affiliate search (Impact media partner " +
        id +
        "). HAVKAR does not invent fares; in-app API sales stay contract-gated."
      : "Opens official Omio public search (untracked). Bind OMIO_AFFILIATE_ID=" +
        HAVKAR_IMPACT_MEDIA_PARTNER_ID +
        " for Impact attribution. HAVKAR does not invent fares."
  };
}

/**
 * Bundle official partner redirects for global / multimodal travel.
 * Never invents schedules or prices inside HAVKAR.
 */
function buildGlobalTravelPartnerLinks(query = {}, env = process.env) {
  const q = normalizeQuery(query);
  const omio = buildOmioAffiliateSearchUrl(q, env);
  const r2r = buildRome2RioSearchUrl(q);
  const links = [];
  if (omio.ok) {
    links.push({
      id: "omio",
      label: "Continue on Omio",
      url: omio.url,
      tracked: omio.tracked,
      modes: q.mode === "all" || q.mode === "multimodal"
        ? ["train", "bus", "ferry"]
        : [q.mode],
      honesty: omio.honesty
    });
  }
  if (r2r.ok) {
    links.push({
      id: "rome2rio",
      label: "Explore combined routes on Rome2Rio",
      url: r2r.url,
      tracked: false,
      modes: ["train", "bus", "ferry", "flight_mix_on_partner"],
      honesty: r2r.honesty
    });
  }
  return {
    ok: links.length > 0,
    action: "travel_partner_links",
    query: q,
    links: links,
    coverage: travelCoverageReport(env),
    honesty:
      "HAVKAR opens official partner search pages only. A search form is not live in-app ticket sales. Empty partner results mean no covered service — nothing is fabricated.",
    error: links.length ? null : "from_to_required"
  };
}

/**
 * Honest coverage matrix for Owner reporting (no invented inventory).
 */
function travelCoverageReport(env = process.env) {
  const status = omioConfigured(env);
  return {
    worldwide_city_search_ui: true,
    in_app_ticket_sales: false,
    surface_redirect: {
      provider: "Omio.com public search",
      status: "active_redirect",
      modes: ["train", "bus", "ferry", "combined_surface"],
      geography:
        "Wherever Omio lists inventory (broad Europe + selected worldwide corridors). Exact city coverage is decided on Omio — HAVKAR does not invent coverage.",
      impact_tracking: status.affiliate_tracked
        ? "tracked_partner_" + (status.impact_partner_program.media_partner_id_bound || "")
        : "untracked_bind_OMIO_AFFILIATE_ID",
      impact_media_partner_expected: HAVKAR_IMPACT_MEDIA_PARTNER_ID,
      impact_program_id: "7385",
      in_app_inventory: status.live_search ? "api_ready_when_contracted" : "not_live_needs_contract",
      booking_in_havkar: status.live_booking ? "flagged" : "not_enabled"
    },
    multimodal_redirect: {
      provider: "Rome2Rio public map",
      status: "active_redirect",
      modes: ["combined_train_bus_ferry_and_partner_flight_mix"],
      geography: "Global city-to-city explorer on Rome2Rio. Intercontinental surface legs only when that partner shows them.",
      in_app_inventory: false
    },
    taxi_transfer_redirect: {
      providers: ["Google Maps directions", "Uber deep link"],
      status: "active_redirect",
      in_app_fares: false,
      contract_needed: "Dedicated taxi/transfer partner (e.g. Welcome Pickups) for in-app booking"
    },
    flights: {
      status: "independent_awaiting_partnership_response",
      duffel_search: "available_when_signed_in",
      google_flights_redirect: true,
      live_booking_in_havkar: false,
      note: "Flight module kept intact; production live booking waits Owner/partner authorization."
    },
    requires_owner_contract: [
      "OMIO_API_KEY + HAVKAR_OMIO_API_ENABLED + HAVKAR_OMIO_CONTRACT_VERIFIED for in-app Omio inventory",
      "OMIO_AFFILIATE_ID for tracked affiliate attribution",
      "HAVKAR_OMIO_LIVE_BOOKING_ENABLED for partner booking inside HAVKAR",
      "Taxi/transfer booking partner agreement",
      "Flight live booking / partnership confirmation (Duffel live_mode)"
    ]
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
    modes: ["train", "bus", "ferry", "all", "multimodal"],
    geography: "global_city_free_text_via_partner_redirect",
    credential_present: Boolean(key),
    affiliate_id_present: Boolean(aff),
    /* Public Omio.com search URL always works; tracked affiliate needs OMIO_AFFILIATE_ID. */
    affiliate_search_ready: true,
    affiliate_tracked: Boolean(aff),
    impact_partner_program: {
      advertiser_id: "463493",
      program_id: "7385",
      media_partner_id_expected: HAVKAR_IMPACT_MEDIA_PARTNER_ID,
      media_partner_id_bound: aff || null,
      media_partner_match: aff === HAVKAR_IMPACT_MEDIA_PARTNER_ID,
      note:
        "Catalog advertiser/program ids are not tracking tokens. OMIO_AFFILIATE_ID must be Impact media partner " +
        HAVKAR_IMPACT_MEDIA_PARTNER_ID +
        "."
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
        ? "Bind OMIO_AFFILIATE_ID=" +
          HAVKAR_IMPACT_MEDIA_PARTNER_ID +
          " (Impact media partner) — do not use advertiser 463493 or program 7385"
        : aff !== HAVKAR_IMPACT_MEDIA_PARTNER_ID
          ? "OMIO_AFFILIATE_ID is set but does not match Owner Impact account " +
            HAVKAR_IMPACT_MEDIA_PARTNER_ID
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
    const bundle = buildGlobalTravelPartnerLinks(q, env);
    return {
      ok: false,
      action: "omio_search",
      results: [],
      error: "omio_blocked",
      status,
      partner_redirect: redirect.ok ? redirect : null,
      partner_links: bundle,
      honesty:
        "Direct Omio API search is not live. No journeys or fares are fabricated. Use official Omio / Rome2Rio partner links for worldwide corridors.",
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
    /* all/multimodal use partner redirect; direct API mode filter is train|bus|ferry only */
    const redirect = buildGlobalTravelPartnerLinks(q, env);
    return {
      ok: false,
      action: "omio_search",
      results: [],
      error: "use_partner_redirect_for_combined_modes",
      status,
      partner_redirect: redirect.links && redirect.links[0] ? redirect.links[0] : null,
      partner_links: redirect,
      honesty:
        "Combined / all-mode search uses official Omio + Rome2Rio redirects. No fabricated multimodal itineraries.",
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
  buildRome2RioSearchUrl,
  buildGlobalTravelPartnerLinks,
  travelCoverageReport,
  rome2rioSlug,
  affiliateId,
  SURFACE_MODES,
  HAVKAR_IMPACT_MEDIA_PARTNER_ID,
  FORBIDDEN_AFFILIATE_IDS
};
