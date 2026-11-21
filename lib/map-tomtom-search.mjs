/**
 * Server-side TomTom Search / geocode proxy for Tickets + Accommodation maps.
 * HAVKAR_TOMTOM_API_KEY never leaves the server.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getTomTomApiKey, tomtomConfigured } = require("./tomtom-key.cjs");
const {
  SEARCH_TTL_MS,
  SEARCH_PER_MIN,
  cacheGet,
  cacheSet,
  searchCache,
  rateLimit
} = require("./tomtom-guard.cjs");

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function mapResult(row) {
  const pos = row && row.position ? row.position : {};
  const lat = Number(pos.lat);
  const lon = Number(pos.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const addr = (row.address || {});
  const city = addr.municipality || addr.localName || addr.municipalitySubdivision || null;
  const region = addr.countrySubdivision || addr.countrySecondarySubdivision || null;
  const country = addr.country || null;
  const poiName = row.poi && row.poi.name ? String(row.poi.name) : null;
  const freeform = row.address && row.address.freeformAddress ? row.address.freeformAddress : null;
  const labelCore = poiName || freeform || city || "Place";
  const labelParts = [labelCore];
  if (city && String(labelCore).toLowerCase().indexOf(String(city).toLowerCase()) === -1) {
    labelParts.push(city);
  }
  if (country && String(labelCore).toLowerCase().indexOf(String(country).toLowerCase()) === -1) {
    labelParts.push(country);
  }
  return {
    label: labelParts.join(", "),
    latitude: lat,
    longitude: lon,
    type: (row.type || (row.poi && "poi") || null),
    country_code: addr.countryCode ? String(addr.countryCode).toLowerCase() : null,
    city,
    region,
    country,
    poi_name: poiName,
    address: {
      city,
      region,
      country_code: addr.countryCode ? String(addr.countryCode).toLowerCase() : null,
      road: addr.streetName || null,
      postcode: addr.postalCode || null,
      country: country
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const body = req.method === "POST" && req.body && typeof req.body === "object" ? req.body : {};
  const q = req.query || {};
  const query = String(q.q || q.query || body.q || body.query || "").trim();
  const limitRaw = Number(q.limit || body.limit || 6);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 10) : 6;
  const typeahead =
    String(q.typeahead || q.mode || body.typeahead || body.mode || "")
      .toLowerCase()
      .indexOf("auto") !== -1 ||
    String(q.typeahead || body.typeahead || "") === "1" ||
    String(q.typeahead || body.typeahead || "") === "true";
  const lat = Number(q.lat != null ? q.lat : body.lat);
  const lon = Number(
    q.lon != null ? q.lon : q.lng != null ? q.lng : body.lon != null ? body.lon : body.lng
  );
  const radiusRaw = Number(q.radius || q.radius_m || body.radius || body.radius_m || 0);
  const hasBias = Number.isFinite(lat) && Number.isFinite(lon);
  const radiusM = hasBias
    ? Math.min(Math.max(Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : 5000, 100), 50000)
    : null;

  if (query.length < 2) {
    return send(res, 200, { ok: false, error: "query_too_short", results: [] });
  }

  const limited = rateLimit(req, "tomtom_search", SEARCH_PER_MIN);
  if (!limited.ok) {
    return send(res, 429, limited);
  }

  const cacheKey =
    query.toLowerCase() +
    "|" +
    limit +
    "|" +
    (typeahead ? "ta" : "full") +
    "|" +
    (hasBias ? lat.toFixed(4) + "," + lon.toFixed(4) + "," + radiusM : "nobias");
  const cached = cacheGet(searchCache, cacheKey);
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
      commercial_note: cfg.commercial_note,
      results: []
    });
  }

  let url =
    "https://api.tomtom.com/search/2/search/" +
    encodeURIComponent(query) +
    ".json?key=" +
    encodeURIComponent(key) +
    "&limit=" +
    limit +
    "&language=en-US" +
    (typeahead ? "&typeahead=true" : "");
  if (hasBias) {
    url +=
      "&lat=" +
      encodeURIComponent(String(lat)) +
      "&lon=" +
      encodeURIComponent(String(lon)) +
      "&radius=" +
      encodeURIComponent(String(radiusM));
  }

  try {
    const upstream = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000)
    });
    if (!upstream.ok) {
      return send(res, 200, {
        ok: false,
        available: true,
        error: "tomtom_search_upstream",
        http_status: upstream.status,
        results: []
      });
    }
    const data = await upstream.json();
    const rows = Array.isArray(data.results) ? data.results : [];
    const results = rows.map(mapResult).filter(Boolean);
    if (!results.length) {
      return send(res, 200, {
        ok: false,
        available: true,
        error: "no_matching_place",
        provider: "tomtom_search",
        query,
        results: []
      });
    }
    const fetchedAt = new Date().toISOString();
    const payload = {
      ok: true,
      available: true,
      query,
      provider: "tomtom_search",
      key_env: source,
      primary: results[0],
      results,
      fetched_at: fetchedAt,
      last_updated: fetchedAt,
      commercial_note: cfg.commercial_note,
      free_for_users: true
    };
    cacheSet(searchCache, cacheKey, payload, SEARCH_TTL_MS);
    return send(res, 200, payload);
  } catch (_e) {
    return send(res, 200, {
      ok: false,
      available: true,
      error: "tomtom_search_network",
      results: []
    });
  }
}
