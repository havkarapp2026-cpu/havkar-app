/**
 * Server-side TomTom Routing proxy for Tickets + Accommodation maps.
 * Key never leaves the server.
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

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const body = req.method === "POST" && req.body && typeof req.body === "object" ? req.body : {};
  const q = req.query || {};
  const fromLat = num(q.fromLat != null ? q.fromLat : body.fromLat);
  const fromLng = num(q.fromLng != null ? q.fromLng : body.fromLng);
  const toLat = num(q.toLat != null ? q.toLat : body.toLat);
  const toLng = num(q.toLng != null ? q.toLng : body.toLng);
  const profile = String(q.profile || body.profile || "driving");
  const mode = travelMode(profile);

  if (
    !Number.isFinite(fromLat) ||
    !Number.isFinite(fromLng) ||
    !Number.isFinite(toLat) ||
    !Number.isFinite(toLng)
  ) {
    return send(res, 400, { ok: false, error: "invalid_coordinates" });
  }

  const limited = rateLimit(req, "tomtom_route", ROUTE_PER_MIN);
  if (!limited.ok) {
    return send(res, 429, limited);
  }

  const cacheKey = [fromLat.toFixed(5), fromLng.toFixed(5), toLat.toFixed(5), toLng.toFixed(5), mode].join("|");
  const cached = cacheGet(routeCache, cacheKey);
  if (cached) {
    return send(res, 200, Object.assign({}, cached, { cached: true }));
  }

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

  const locs =
    fromLat +
    "," +
    fromLng +
    ":" +
    toLat +
    "," +
    toLng;
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
      signal: AbortSignal.timeout(15000)
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
    const coordinates = [];
    route.legs.forEach(function (leg) {
      const points = (leg && leg.points) || [];
      points.forEach(function (p) {
        const lat = Number(p.latitude);
        const lon = Number(p.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          coordinates.push([lon, lat]);
        }
      });
    });
    const fetchedAt = new Date().toISOString();
    const payload = {
      ok: true,
      available: true,
      provider: "tomtom_routing",
      key_env: source,
      profile: mode,
      distance_m: summary.lengthInMeters,
      duration_s: summary.travelTimeInSeconds,
      traffic_delay_s: summary.trafficDelayInSeconds,
      geometry: { type: "LineString", coordinates },
      fetched_at: fetchedAt,
      last_updated: fetchedAt,
      commercial_note: cfg.commercial_note,
      free_for_users: true,
      evaluation_note:
        "TomTom Routing Free/Evaluation quota only; traffic-aware when TomTom supplies live traffic for the corridor."
    };
    cacheSet(routeCache, cacheKey, payload, ROUTE_TTL_MS);
    return send(res, 200, payload);
  } catch (_e) {
    return send(res, 200, {
      ok: false,
      available: true,
      error: "tomtom_routing_network"
    });
  }
}
