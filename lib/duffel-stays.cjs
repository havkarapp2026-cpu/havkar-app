/*
 * Duffel Stays probe + thin client helpers.
 * Direct HAVKAR owner inventory is a separate provider — never upload
 * owner properties into Duffel. Stays access must be approved by Duffel.
 */

const DUFFEL_API = "https://api.duffel.com";
const DUFFEL_VERSION = "v2";

function classifyStaysAccess(probe) {
  if (!probe || probe.token_mode === "missing") {
    return {
      ok: false,
      access: "missing_token",
      stays_ready: false,
      requirement: "Configure DUFFEL_ACCESS_TOKEN before probing Stays."
    };
  }

  if (probe.http_status === 401 || probe.http_status === 403) {
    return {
      ok: false,
      access: "denied",
      stays_ready: false,
      requirement:
        "Duffel rejected Stays access. Request Duffel Stays approval in the Duffel Dashboard, then use an authorized token."
    };
  }

  if (probe.http_status === 404) {
    return {
      ok: false,
      access: "not_enabled",
      stays_ready: false,
      requirement:
        "Stays endpoint unavailable for this token. Request Duffel Stays product access (separate from Flights)."
    };
  }

  if (probe.http_status >= 200 && probe.http_status < 300) {
    return {
      ok: true,
      access: "available",
      stays_ready: probe.token_mode === "live" ? false : true,
      note:
        probe.token_mode === "live"
          ? "Live Stays responses must not be enabled for public checkout until Owner authorization."
          : "Test Stays access appears available. Public live bookings stay OFF."
    };
  }

  return {
    ok: false,
    access: "unknown",
    stays_ready: false,
    http_status: probe.http_status || null,
    requirement:
      "Unable to confirm Duffel Stays. Check Duffel Dashboard product entitlements."
  };
}

function duffelHeaders(token) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: "Bearer " + token,
    "Duffel-Version": DUFFEL_VERSION
  };
}

async function probeDuffelStaysAccess(env = process.env, fetchImpl = fetch) {
  const { classifyDuffelAccessToken } = require("./duffel-live-ready.cjs");
  const tokenInfo = classifyDuffelAccessToken(env);
  if (!tokenInfo.ok) {
    return { token_mode: tokenInfo.mode, ...classifyStaysAccess({ token_mode: "missing" }) };
  }

  const token = String(env.DUFFEL_ACCESS_TOKEN || "").trim();
  let response;
  try {
    // Minimal search body — location near Rome; used only to probe entitlement.
    response = await fetchImpl(DUFFEL_API + "/stays/search", {
      method: "POST",
      headers: duffelHeaders(token),
      body: JSON.stringify({
        data: {
          rooms: 1,
          guests: [{ type: "adult" }],
          check_in_date: "2099-01-10",
          check_out_date: "2099-01-12",
          location: {
            geographic_coordinates: {
              latitude: 41.9028,
              longitude: 12.4964
            },
            radius: 5
          }
        }
      })
    });
  } catch (_error) {
    return {
      token_mode: tokenInfo.mode,
      ok: false,
      access: "network_error",
      stays_ready: false,
      requirement: "Request to Duffel Stays failed: network error."
    };
  }

  const classified = classifyStaysAccess({
    token_mode: tokenInfo.mode,
    http_status: response.status
  });

  return {
    token_mode: tokenInfo.mode,
    http_status: response.status,
    ...classified
  };
}

/**
 * Real Stays search when access is available.
 * Never invents inventory. Public live booking stays Owner-gated separately.
 */
async function searchDuffelStays(params, env = process.env, fetchImpl = fetch) {
  const probe = await probeDuffelStaysAccess(env, fetchImpl);
  if (!probe.ok || probe.access !== "available") {
    return {
      ok: false,
      access: probe.access,
      results: [],
      requirement: probe.requirement || probe.note || "Duffel Stays not available."
    };
  }

  // Refuse live inventory for public checkout until Owner auth + live token policy.
  if (probe.token_mode === "live") {
    return {
      ok: false,
      access: "live_gated",
      results: [],
      requirement:
        "Live Duffel Stays inventory is withheld until explicit Owner authorization for public hotel booking."
    };
  }

  const token = String(env.DUFFEL_ACCESS_TOKEN || "").trim();
  const checkIn = String(params.check_in || "").trim();
  const checkOut = String(params.check_out || "").trim();
  const adults = Math.max(1, Math.min(20, Number(params.adults) || 2));
  const rooms = Math.max(1, Math.min(10, Number(params.rooms) || 1));
  const lat = Number(params.latitude);
  const lng = Number(params.longitude);

  if (!checkIn || !checkOut || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      ok: false,
      access: probe.access,
      results: [],
      requirement:
        "Duffel Stays search requires check_in, check_out, latitude and longitude."
    };
  }

  const guests = [];
  for (let i = 0; i < adults; i += 1) {
    guests.push({ type: "adult" });
  }
  const children = Math.max(0, Math.min(20, Number(params.children) || 0));
  for (let i = 0; i < children; i += 1) {
    guests.push({ type: "child", age: 8 });
  }

  let response;
  try {
    response = await fetchImpl(DUFFEL_API + "/stays/search", {
      method: "POST",
      headers: duffelHeaders(token),
      body: JSON.stringify({
        data: {
          rooms,
          guests,
          check_in_date: checkIn,
          check_out_date: checkOut,
          location: {
            geographic_coordinates: {
              latitude: lat,
              longitude: lng
            },
            radius: Number(params.radius) || 5
          }
        }
      })
    });
  } catch (_error) {
    return {
      ok: false,
      access: "network_error",
      results: [],
      requirement: "Duffel Stays search network error."
    };
  }

  let body = null;
  try {
    body = await response.json();
  } catch (_e) {
    body = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      access: probe.access,
      http_status: response.status,
      results: [],
      requirement:
        (body && body.errors && body.errors[0] && body.errors[0].message) ||
        "Duffel Stays search rejected."
    };
  }

  const rows = (body && body.data && body.data.results) || body.data || [];
  const list = Array.isArray(rows) ? rows : [];

  return {
    ok: true,
    access: probe.access,
    token_mode: probe.token_mode,
    http_status: response.status,
    results: list.slice(0, 40).map((row) => ({
      provider: "duffel_stays",
      id: row.id || row.accommodation && row.accommodation.id || null,
      title:
        (row.accommodation && row.accommodation.name) ||
        row.name ||
        "Duffel stay",
      summary:
        (row.accommodation &&
          row.accommodation.description &&
          String(row.accommodation.description).slice(0, 400)) ||
        null,
      raw_rate_hint: row.cheapest_rate_total_amount || null,
      bookable: false,
      reason:
        "Public Duffel Stays checkout stays Owner-gated. Quote/book APIs exist server-side when authorized."
    })),
    public_live_booking: false
  };
}

module.exports = {
  DUFFEL_API,
  DUFFEL_VERSION,
  classifyStaysAccess,
  probeDuffelStaysAccess,
  searchDuffelStays
};
