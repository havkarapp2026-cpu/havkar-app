/**
 * Multi-stop trip planner via TomTom Routing (server key only).
 * Accepts ordered waypoints; never invents travel times or traffic.
 * Plans are computed server-side; persistence stays client-side until Owner arms sync.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getTomTomApiKey, tomtomConfigured } = require("./tomtom-key.cjs");
const {
  ROUTE_TTL_MS,
  ROUTE_PER_MIN,
  cacheGet,
  cacheSet,
  routeCache,
  rateLimit
} = require("./tomtom-guard.cjs");

const TIMEOUT_MS = 18000;
const MAX_STOPS = 8;

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function travelMode(profile) {
  const p = String(profile || "driving").toLowerCase();
  if (p === "walking" || p === "foot" || p === "pedestrian") return "pedestrian";
  if (p === "cycling" || p === "bike" || p === "bicycle") return "bicycle";
  return "car";
}

function parseStops(req) {
  const body = req.method === "POST" && req.body && typeof req.body === "object" ? req.body : {};
  const q = req.query || {};
  let raw = body.stops != null ? body.stops : q.stops;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (_e) {
      raw = null;
    }
  }
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const stops = [];
  for (let i = 0; i < raw.length && stops.length < MAX_STOPS; i++) {
    const s = raw[i] || {};
    const lat = num(s.lat != null ? s.lat : s.latitude);
    const lng = num(s.lng != null ? s.lng : s.longitude != null ? s.longitude : s.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    stops.push({
      lat: lat,
      lng: lng,
      label: String(s.label || s.name || "Stop " + (stops.length + 1)).slice(0, 120),
      kind: String(s.kind || s.type || "place").slice(0, 40)
    });
  }
  return stops.length >= 2 ? stops : null;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const stops = parseStops(req);
  if (!stops) {
    return send(res, 400, {
      ok: false,
      error: "invalid_stops",
      message: "Provide at least 2 stops with lat/lng (max " + MAX_STOPS + ").",
      max_stops: MAX_STOPS
    });
  }

  const body = req.method === "POST" && req.body && typeof req.body === "object" ? req.body : {};
  const q = req.query || {};
  const profile = String(q.profile || body.profile || "driving");
  const mode = travelMode(profile);

  const limited = rateLimit(req, "tomtom_trip_plan", ROUTE_PER_MIN);
  if (!limited.ok) return send(res, 429, limited);

  const cacheKey =
    "trip|" +
    mode +
    "|" +
    stops
      .map(function (s) {
        return s.lat.toFixed(5) + "," + s.lng.toFixed(5);
      })
      .join(":");
  const cached = cacheGet(routeCache, cacheKey);
  if (cached) return send(res, 200, Object.assign({}, cached, { cached: true }));

  const { key, source } = getTomTomApiKey();
  const cfg = tomtomConfigured();
  if (!key) {
    return send(res, 200, {
      ok: false,
      available: false,
      error: "tomtom_not_configured",
      requires_owner_secret: "HAVKAR_TOMTOM_API_KEY",
      commercial_note: cfg.commercial_note
    });
  }

  const locs = stops
    .map(function (s) {
      return s.lat + "," + s.lng;
    })
    .join(":");
  const url =
    "https://api.tomtom.com/routing/1/calculateRoute/" +
    locs +
    "/json?key=" +
    encodeURIComponent(key) +
    "&travelMode=" +
    encodeURIComponent(mode) +
    "&traffic=true&routeRepresentation=polyline&computeTravelTimeFor=all";

  try {
    const upstream = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!upstream.ok) {
      return send(res, 200, {
        ok: false,
        available: true,
        error: "tomtom_routing_upstream",
        http_status: upstream.status
      });
    }
    const data = await upstream.json();
    const route = data && data.routes && data.routes[0];
    if (!route || !route.legs || !route.legs.length) {
      return send(res, 200, {
        ok: false,
        available: true,
        error: "route_unavailable",
        provider: "tomtom_routing"
      });
    }

    const summary = route.summary || {};
    const legs = [];
    const coordinates = [];
    route.legs.forEach(function (leg, i) {
      const ls = leg.summary || {};
      const from = stops[i];
      const to = stops[i + 1];
      legs.push({
        from: from,
        to: to,
        distance_m: ls.lengthInMeters != null ? ls.lengthInMeters : null,
        duration_s: ls.travelTimeInSeconds != null ? ls.travelTimeInSeconds : null,
        traffic_delay_s: ls.trafficDelayInSeconds != null ? ls.trafficDelayInSeconds : null
      });
      const points = (leg && leg.points) || [];
      points.forEach(function (p) {
        const lat = Number(p.latitude);
        const lon = Number(p.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          coordinates.push([lon, lat]);
        }
      });
    });

    const delay = Number(summary.trafficDelayInSeconds) || 0;
    const fetchedAt = new Date().toISOString();
    const payload = {
      ok: true,
      available: true,
      provider: "tomtom_routing",
      key_env: source,
      profile: mode,
      stops: stops,
      legs: legs,
      distance_m: summary.lengthInMeters,
      duration_s: summary.travelTimeInSeconds,
      traffic_delay_s: delay,
      traffic_alert:
        delay >= 300
          ? {
              level: "notice",
              message:
                "TomTom reports about " +
                Math.round(delay / 60) +
                " minutes of traffic delay on this corridor.",
              source: "tomtom_routing",
              last_updated: fetchedAt
            }
          : null,
      geometry: { type: "LineString", coordinates: coordinates },
      share_safe: {
        stop_count: stops.length,
        labels: stops.map(function (s) {
          return s.label;
        }),
        note: "Share labels only — do not attach live GPS, ticket codes, or personal contact details."
      },
      free_for_users: true,
      persistence: "client_local_until_owner_arms_sync",
      fetched_at: fetchedAt,
      last_updated: fetchedAt,
      commercial_note: cfg.commercial_note,
      honesty:
        "Travel times and traffic delay come from TomTom for the exact waypoints supplied. Empty or failed routes are never replaced with invented ETAs."
    };
    cacheSet(routeCache, cacheKey, payload, ROUTE_TTL_MS);
    return send(res, 200, payload);
  } catch (_e) {
    return send(res, 200, {
      ok: false,
      available: true,
      error: "tomtom_trip_plan_network"
    });
  }
}
