/**
 * Public redistributable cameras only (commercial-OK / open licences):
 * - Singapore LTA Traffic Images
 * - Fintraffic Digitraffic Finland weathercams (CC BY 4.0)
 * - City of Calgary traffic cameras (Open Government Licence)
 * - Datumfeed registries with commercialOk === true
 * Never accepts client-supplied stream URLs. Never invents coverage.
 * Registries with unknown commercialOk (Caltrans, WSDOT, Ottawa) are excluded.
 * Accepts bbox=… or lat/lng/radius_km for place-centered search.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { haversineKm, bboxFromRadiusKm, parseLatLngRadius } = require("./map-geo-util.cjs");
const { listCameraSources } = require("./map-camera-sources.cjs");

const TIMEOUT_MS = 12000;
const MAX_LIMIT = 60;
const DATUMFEED_COMMERCIAL = new Set([
  "austin-traffic",
  "ontario-511",
  "tfl-jamcams",
  "toronto-city"
]);

/** Short in-memory caches for large open catalogues */
const DIGI_CACHE_TTL_MS = 5 * 60 * 1000;
const CALGARY_CACHE_TTL_MS = 5 * 60 * 1000;
let digiCache = null;
let calgaryCache = null;

function send(res, status, body) {
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(status).json(body);
}

function parseBbox(raw) {
  const parts = String(raw || "")
    .split(",")
    .map(function (p) {
      return Number(String(p).trim());
    });
  if (parts.length !== 4 || parts.some(function (n) {
    return !Number.isFinite(n);
  })) {
    return null;
  }
  const west = parts[0];
  const south = parts[1];
  const east = parts[2];
  const north = parts[3];
  if (west >= east || south >= north) return null;
  if (Math.abs(east - west) > 25 || Math.abs(north - south) > 25) return null;
  return { west: west, south: south, east: east, north: north };
}

function inBbox(lat, lon, bbox) {
  return (
    lat >= bbox.south &&
    lat <= bbox.north &&
    lon >= bbox.west &&
    lon <= bbox.east
  );
}

function bboxIntersects(a, b) {
  return !(a.east < b.west || a.west > b.east || a.north < b.south || a.south > b.north);
}

function looksIntersection(name) {
  const n = String(name || "").toLowerCase();
  return (
    n.includes(" / ") ||
    n.includes(" & ") ||
    n.includes(" intersection") ||
    n.includes(" junction") ||
    n.includes(" cross") ||
    /\b(rd|blvd|ave|st|street|road)\b.+\b(rd|blvd|ave|st|street|road)\b/.test(n)
  );
}

async function fetchSingapore(bbox, limit) {
  const response = await fetch("https://api.data.gov.sg/v1/transport/traffic-images", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) return [];
  const body = await response.json();
  const item = body && Array.isArray(body.items) ? body.items[0] : null;
  const cams = item && Array.isArray(item.cameras) ? item.cameras : [];
  const out = [];
  for (const cam of cams) {
    const lat = Number(cam.location && cam.location.latitude);
    const lon = Number(cam.location && cam.location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (bbox && !inBbox(lat, lon, bbox)) continue;
    const id = "sg-lta-" + String(cam.camera_id || "").trim();
    if (!id || id === "sg-lta-") continue;
    const image = String(cam.image || "");
    if (!image.startsWith("https://images.data.gov.sg/")) continue;
    out.push({
      id: id,
      name: "Singapore LTA camera " + String(cam.camera_id),
      latitude: lat,
      longitude: lon,
      kind: "intersection",
      feed_type: "jpeg_periodic",
      live_stream: false,
      image_url: image,
      source_url: "https://data.gov.sg/dataset/traffic-images",
      updated_at: cam.timestamp || item.timestamp || "",
      attribution: "Land Transport Authority (Singapore)",
      license: "Singapore Open Data Licence",
      license_url: "https://data.gov.sg/open-data-licence",
      commercial_ok: true,
      source: "singapore-lta",
      country: "SG",
      city: "Singapore",
      status: "snapshot"
    });
    if (out.length >= limit) break;
  }
  return out;
}

const FINLAND_BBOX = { west: 19.0, south: 59.5, east: 31.6, north: 70.2 };

async function loadDigitrafficStations() {
  if (digiCache && Date.now() < digiCache.expires) return digiCache.rows;
  const response = await fetch("https://tie.digitraffic.fi/api/weathercam/v1/stations", {
    headers: {
      Accept: "application/json",
      "Digitraffic-User": "HAVKAR/1.0 (https://havkar.online)"
    },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) return [];
  const body = await response.json();
  const feats = body && Array.isArray(body.features) ? body.features : [];
  const rows = [];
  for (const f of feats) {
    const props = f.properties || {};
    const coords = (f.geometry && f.geometry.coordinates) || [];
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const presets = Array.isArray(props.presets) ? props.presets : [];
    const preset = presets.find(function (p) {
      return p && p.id;
    });
    if (!preset) continue;
    const presetId = String(preset.id);
    rows.push({
      id: "fi-digi-" + presetId,
      name: String(props.name || presetId),
      latitude: lat,
      longitude: lon,
      kind: "intersection",
      feed_type: "jpeg_periodic",
      live_stream: false,
      image_url: "https://weathercam.digitraffic.fi/" + encodeURIComponent(presetId) + ".jpg",
      source_url: "https://www.digitraffic.fi/en/road-traffic/",
      updated_at: props.dataUpdatedTime || "",
      attribution: "Fintraffic Digitraffic",
      license: "Creative Commons Attribution 4.0",
      license_url: "https://www.digitraffic.fi/en/developers/",
      commercial_ok: true,
      source: "digitraffic-finland",
      country: "FI",
      city: String(props.name || "").split("_")[0] || "Finland",
      status: "snapshot"
    });
  }
  digiCache = { rows: rows, expires: Date.now() + DIGI_CACHE_TTL_MS };
  return rows;
}

async function fetchDigitraffic(bbox, limit) {
  if (!bbox || !bboxIntersects(bbox, FINLAND_BBOX)) return [];
  try {
    const rows = await loadDigitrafficStations();
    const out = [];
    for (const row of rows) {
      if (!inBbox(row.latitude, row.longitude, bbox)) continue;
      out.push(row);
      if (out.length >= limit) break;
    }
    return out;
  } catch (_e) {
    return [];
  }
}

const CALGARY_BBOX = { west: -114.45, south: 50.82, east: -113.75, north: 51.25 };

async function loadCalgaryCameras() {
  if (calgaryCache && Date.now() < calgaryCache.expires) return calgaryCache.rows;
  const response = await fetch(
    "https://data.calgary.ca/resource/k7p9-kppz.json?$limit=500",
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    }
  );
  if (!response.ok) return [];
  const body = await response.json();
  const list = Array.isArray(body) ? body : [];
  const rows = [];
  for (const cam of list) {
    const point = cam.point || {};
    const coords = Array.isArray(point.coordinates) ? point.coordinates : [];
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const camUrl = cam.camera_url;
    const image =
      typeof camUrl === "string"
        ? camUrl
        : camUrl && typeof camUrl.url === "string"
          ? camUrl.url
          : "";
    if (!/^https:\/\/trafficcam\.calgary\.ca\//i.test(image)) continue;
    const name = String(cam.camera_location || (camUrl && camUrl.description) || "Calgary camera");
    const slug = image.replace(/^https:\/\/trafficcam\.calgary\.ca\//i, "").replace(/\.jpg$/i, "");
    rows.push({
      id: "ca-calgary-" + slug,
      name: name,
      latitude: lat,
      longitude: lon,
      kind: looksIntersection(name) ? "intersection" : "public_live",
      feed_type: "jpeg_periodic",
      live_stream: false,
      image_url: image,
      source_url: "https://data.calgary.ca/Transportation-Transit/Traffic-Cameras/k7p9-kppz",
      updated_at: "",
      attribution: "City of Calgary",
      license: "Open Government Licence – City of Calgary",
      license_url: "https://data.calgary.ca/",
      commercial_ok: true,
      source: "calgary-traffic",
      country: "CA",
      city: "Calgary",
      status: "snapshot"
    });
  }
  calgaryCache = { rows: rows, expires: Date.now() + CALGARY_CACHE_TTL_MS };
  return rows;
}

async function fetchCalgary(bbox, limit) {
  if (!bbox || !bboxIntersects(bbox, CALGARY_BBOX)) return [];
  try {
    const rows = await loadCalgaryCameras();
    const out = [];
    for (const row of rows) {
      if (!inBbox(row.latitude, row.longitude, bbox)) continue;
      out.push(row);
      if (out.length >= limit) break;
    }
    return out;
  } catch (_e) {
    return [];
  }
}

function datumfeedCityForBbox(bbox) {
  /* Rough city hints for commercialOk registries only. */
  const midLat = (bbox.south + bbox.north) / 2;
  const midLon = (bbox.west + bbox.east) / 2;
  if (midLat > 51.2 && midLat < 51.8 && midLon > -0.6 && midLon < 0.4) return "london";
  if (midLat > 43.4 && midLat < 44.0 && midLon > -80.0 && midLon < -78.8) return "toronto";
  if (midLat > 41.5 && midLat < 57.5 && midLon > -95.5 && midLon < -74.0) return "ontario";
  if (midLat > 29.9 && midLat < 30.7 && midLon > -98.1 && midLon < -97.4) return "austin";
  return "";
}

async function fetchDatumfeed(bbox, kind, limit) {
  const city = datumfeedCityForBbox(bbox);
  if (!city) return [];
  const headers = { Accept: "application/json" };
  const key = String(process.env.DATUMFEED_API_KEY || "").trim();
  if (key) headers.Authorization = "Bearer " + key;

  const url =
    "https://datumfeed.com/api/cameras?city=" +
    encodeURIComponent(city) +
    "&verificationStatus=auto_checked&minTrust=50&limit=" +
    Math.min(limit, 100);
  const response = await fetch(url, {
    headers: headers,
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) return [];
  const body = await response.json();
  const cams = body && Array.isArray(body.cameras) ? body.cameras : [];
  const out = [];
  for (const cam of cams) {
    const reg = cam.registry || {};
    if (reg.commercialOk !== true) continue;
    if (!DATUMFEED_COMMERCIAL.has(String(reg.slug || ""))) continue;
    const lat = Number(cam.lat);
    const lon = Number(cam.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!inBbox(lat, lon, bbox)) continue;
    if (cam.active !== true) continue;
    const feedUrl = String(cam.feedUrl || "");
    if (!/^https:\/\//i.test(feedUrl)) continue;
    const name = String(cam.name || cam.id || "Public camera");
    const isIntersection = looksIntersection(name);
    if (kind === "intersection" && !isIntersection) continue;
    const id = "df-" + String(cam.id || "").trim();
    if (!id || id === "df-") continue;
    out.push({
      id: id,
      name: name,
      latitude: lat,
      longitude: lon,
      kind: isIntersection ? "intersection" : "public_live",
      feed_type: cam.feedType || "jpeg_poll",
      live_stream: false,
      image_url: feedUrl,
      frame_proxy:
        "https://datumfeed.com/api/cameras/" +
        encodeURIComponent(String(cam.id)) +
        "/frame",
      source_url: reg.licenseUrl || "https://datumfeed.com/",
      updated_at: (cam.stats && cam.stats.lastOkAt) || "",
      attribution: reg.attribution || "Public camera registry",
      license: reg.licenseName || "",
      license_url: reg.licenseUrl || "",
      commercial_ok: true,
      source: String(reg.slug || "datumfeed"),
      country: reg.country || "",
      city: reg.city || city,
      trust_score: cam.stats && cam.stats.trustScore != null ? cam.stats.trustScore : null,
      status: "snapshot"
    });
    if (out.length >= limit) break;
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const near = parseLatLngRadius(req.query || {});
  let bbox = parseBbox(req.query && req.query.bbox);
  if (!bbox && near) {
    const built = bboxFromRadiusKm(near.lat, near.lng, near.radius_km);
    if (built) {
      bbox = {
        west: built.west,
        south: built.south,
        east: built.east,
        north: built.north
      };
    }
  }
  if (!bbox) {
    return send(res, 400, {
      ok: false,
      error: "invalid_bbox",
      message:
        "Provide bbox=west,south,east,north (max 25° span) or lat/lng/radius_km for place-centered search."
    });
  }

  const kind = String((req.query && req.query.kind) || "all").toLowerCase();
  if (!["all", "live", "intersection"].includes(kind)) {
    return send(res, 400, { ok: false, error: "invalid_kind" });
  }

  let limit = Number((req.query && req.query.limit) || 40);
  if (!Number.isFinite(limit) || limit < 1) limit = 40;
  limit = Math.min(MAX_LIMIT, Math.floor(limit));

  try {
    const [sg, digi, calgary, df] = await Promise.all([
      fetchSingapore(bbox, limit),
      fetchDigitraffic(bbox, limit),
      fetchCalgary(bbox, limit),
      fetchDatumfeed(bbox, kind, limit)
    ]);

    let cameras = sg.concat(digi, calgary, df);
    if (kind === "intersection") {
      cameras = cameras.filter(function (c) {
        return (
          c.kind === "intersection" ||
          c.source === "singapore-lta" ||
          c.source === "digitraffic-finland" ||
          c.source === "calgary-traffic"
        );
      });
    } else if (kind === "live") {
      cameras = cameras.filter(function (c) {
        return (
          c.kind === "public_live" ||
          c.source === "singapore-lta" ||
          c.source === "digitraffic-finland" ||
          c.source === "calgary-traffic"
        );
      });
    }

    if (near) {
      cameras = cameras
        .map(function (c) {
          const km = haversineKm(near.lat, near.lng, c.latitude, c.longitude);
          return Object.assign({}, c, {
            distance_km: Math.round(km * 100) / 100,
            distance_m: Math.round(km * 1000)
          });
        })
        .filter(function (c) {
          return c.distance_km <= near.radius_km;
        })
        .sort(function (a, b) {
          return a.distance_km - b.distance_km;
        });
    }

    cameras = cameras.slice(0, limit);
    const sources = listCameraSources().filter(function (s) {
      return s.kind !== "youtube_live";
    });

    return send(res, 200, {
      ok: true,
      available: cameras.length > 0,
      count: cameras.length,
      fetched_at: new Date().toISOString(),
      search: near
        ? {
            mode: "location_radius",
            latitude: near.lat,
            longitude: near.lng,
            radius_km: near.radius_km
          }
        : { mode: "bbox" },
      sources: sources,
      message:
        cameras.length > 0
          ? ""
          : near
            ? "No licensed public cameras within " +
              near.radius_km +
              " km. Coverage is limited to Singapore, Finland (Digitraffic), Calgary, and selected commercialOk Datumfeed cities — not worldwide."
            : "No licensed public cameras are available in this map area.",
      cameras: cameras,
      datumfeed_key_configured: Boolean(String(process.env.DATUMFEED_API_KEY || "").trim())
    });
  } catch (_e) {
    return send(res, 502, {
      ok: false,
      available: false,
      error: "cameras_network",
      message: "Public camera directory is not available right now."
    });
  }
}
