/**
 * Place-centered nearby POI lookup via TomTom Search (server key only).
 * Used by hotel surroundings, trip planner, and health near-destination links.
 * Never invents places. Empty means no TomTom coverage / no match.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getTomTomApiKey, tomtomConfigured } = require("./tomtom-key.cjs");
const { SEARCH_TTL_MS, SEARCH_PER_MIN, cacheGet, cacheSet, searchCache, rateLimit } = require(
  "./tomtom-guard.cjs"
);
const { haversineKm } = require("./map-geo-util.cjs");

const TIMEOUT_MS = 12000;
const CATEGORIES = [
  { id: "pharmacy", query: "pharmacy", label: "Pharmacies" },
  { id: "hospital", query: "hospital", label: "Hospitals / clinics" },
  { id: "transit", query: "public transport station", label: "Public transport" },
  { id: "restaurant", query: "restaurant", label: "Restaurants" },
  { id: "shop", query: "supermarket", label: "Shops / grocery" },
  { id: "attraction", query: "tourist attraction", label: "Attractions" }
];

function send(res, status, body) {
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(status).json(body);
}

function parseCenter(q) {
  const lat = Number(q.lat != null ? q.lat : q.latitude);
  const lng = Number(q.lng != null ? q.lng : q.longitude != null ? q.longitude : q.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: lat, lng: lng };
}

async function searchCategory(key, center, category, radiusM, limit) {
  const url =
    "https://api.tomtom.com/search/2/poiSearch/" +
    encodeURIComponent(category.query) +
    ".json?key=" +
    encodeURIComponent(key) +
    "&lat=" +
    encodeURIComponent(String(center.lat)) +
    "&lon=" +
    encodeURIComponent(String(center.lng)) +
    "&radius=" +
    encodeURIComponent(String(radiusM)) +
    "&limit=" +
    encodeURIComponent(String(limit)) +
    "&language=en-US";
  const upstream = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!upstream.ok) {
    return { ok: false, http_status: upstream.status, places: [] };
  }
  const data = await upstream.json();
  const rows = Array.isArray(data.results) ? data.results : [];
  const places = [];
  for (const row of rows) {
    const pos = row.position || {};
    const plat = Number(pos.lat);
    const plng = Number(pos.lon);
    if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue;
    const km = haversineKm(center.lat, center.lng, plat, plng);
    const addr = row.address || {};
    const poiName = row.poi && row.poi.name ? String(row.poi.name) : null;
    places.push({
      id: "tt-" + category.id + "-" + String(row.id || plat + "," + plng),
      category_id: category.id,
      category_label: category.label,
      name: poiName || addr.freeformAddress || category.label,
      latitude: plat,
      longitude: plng,
      distance_km: Math.round(km * 100) / 100,
      distance_m: Math.round(km * 1000),
      address: addr.freeformAddress || null,
      city: addr.municipality || addr.localName || null,
      country: addr.country || null,
      country_code: addr.countryCode ? String(addr.countryCode).toLowerCase() : null,
      phone: row.poi && row.poi.phone ? String(row.poi.phone) : null,
      source: "tomtom_poi_search",
      attribution: "TomTom Search",
      fetched_at: new Date().toISOString()
    });
  }
  places.sort(function (a, b) {
    return a.distance_m - b.distance_m;
  });
  return { ok: true, places: places };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const q = req.query || {};
  const center = parseCenter(q);
  if (!center) {
    return send(res, 400, {
      ok: false,
      error: "invalid_location",
      message: "Provide lat and lng for the stay / destination."
    });
  }

  let radiusM = Number(q.radius_m || q.radius || 3000);
  if (!Number.isFinite(radiusM)) radiusM = 3000;
  radiusM = Math.min(Math.max(Math.floor(radiusM), 200), 20000);
  let limit = Number(q.limit || 5);
  if (!Number.isFinite(limit) || limit < 1) limit = 5;
  limit = Math.min(8, Math.floor(limit));

  const categoryFilter = String(q.category || "all").toLowerCase();
  const cats =
    categoryFilter === "all"
      ? CATEGORIES
      : CATEGORIES.filter(function (c) {
          return c.id === categoryFilter;
        });
  if (!cats.length) {
    return send(res, 400, { ok: false, error: "invalid_category", categories: CATEGORIES });
  }

  const limited = rateLimit(req, "tomtom_poi", SEARCH_PER_MIN);
  if (!limited.ok) return send(res, 429, limited);

  const { key, source } = getTomTomApiKey();
  const cfg = tomtomConfigured();
  if (!key) {
    return send(res, 200, {
      ok: false,
      available: false,
      free_for_users: true,
      error: "tomtom_not_configured",
      requires_owner_secret: "HAVKAR_TOMTOM_API_KEY",
      commercial_note: cfg.commercial_note,
      places: [],
      groups: [],
      categories: CATEGORIES
    });
  }

  const cacheKey =
    "pois|" +
    center.lat.toFixed(4) +
    "," +
    center.lng.toFixed(4) +
    "|" +
    radiusM +
    "|" +
    categoryFilter +
    "|" +
    limit;
  const cached = cacheGet(searchCache, cacheKey);
  if (cached) return send(res, 200, Object.assign({}, cached, { cached: true }));

  try {
    const settled = await Promise.all(
      cats.map(function (c) {
        return searchCategory(key, center, c, radiusM, limit);
      })
    );
    const groups = [];
    const places = [];
    cats.forEach(function (c, i) {
      const part = settled[i] || { places: [] };
      groups.push({
        id: c.id,
        label: c.label,
        count: (part.places || []).length,
        places: part.places || []
      });
      places.push.apply(places, part.places || []);
    });
    places.sort(function (a, b) {
      return a.distance_m - b.distance_m;
    });

    const payload = {
      ok: true,
      available: places.length > 0,
      free_for_users: true,
      center: { latitude: center.lat, longitude: center.lng },
      radius_m: radiusM,
      count: places.length,
      groups: groups,
      places: places.slice(0, limit * cats.length),
      categories: CATEGORIES,
      provider: "tomtom_poi_search",
      key_env: source,
      commercial_note: cfg.commercial_note,
      fetched_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      honesty:
        places.length > 0
          ? "TomTom POI results near the given coordinates. Distances are haversine meters; travel time requires routing."
          : "No TomTom POI matches within " + radiusM + " m. Coverage is not worldwide and results are never invented.",
      message:
        places.length > 0
          ? ""
          : "No pharmacies/hospitals/transit/restaurants/shops/attractions found in this radius via TomTom."
    };
    cacheSet(searchCache, cacheKey, payload, SEARCH_TTL_MS);
    return send(res, 200, payload);
  } catch (_e) {
    return send(res, 502, {
      ok: false,
      available: false,
      error: "pois_network",
      message: "Nearby places lookup is not available right now."
    });
  }
}
