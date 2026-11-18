/**
 * Public redistributable cameras only:
 * - Singapore LTA Traffic Images (Open Data Licence — commercial OK)
 * - Datumfeed registries with commercialOk === true
 * Never accepts client-supplied stream URLs. Never includes commercialOk=null/false.
 */

const TIMEOUT_MS = 12000;
const MAX_LIMIT = 60;
const DATUMFEED_COMMERCIAL = new Set([
  "austin-traffic",
  "ontario-511",
  "tfl-jamcams",
  "toronto-city"
]);

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
      updated_at: cam.timestamp || item.timestamp || "",
      attribution: "Land Transport Authority (Singapore)",
      license: "Singapore Open Data Licence",
      license_url: "https://data.gov.sg/open-data-licence",
      commercial_ok: true,
      source: "singapore-lta",
      country: "SG",
      city: "Singapore"
    });
    if (out.length >= limit) break;
  }
  return out;
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
    if (kind === "live" && isIntersection) {
      /* live layer prefers non-intersection tourism/road cams; still allow if few */
    }
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
      updated_at: (cam.stats && cam.stats.lastOkAt) || "",
      attribution: reg.attribution || "Public camera registry",
      license: reg.licenseName || "",
      license_url: reg.licenseUrl || "",
      commercial_ok: true,
      source: String(reg.slug || "datumfeed"),
      country: reg.country || "",
      city: reg.city || city,
      trust_score: cam.stats && cam.stats.trustScore != null ? cam.stats.trustScore : null
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

  const bbox = parseBbox(req.query && req.query.bbox);
  if (!bbox) {
    return send(res, 400, {
      ok: false,
      error: "invalid_bbox",
      message: "Provide bbox=west,south,east,north (max 25° span)."
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
    const [sg, df] = await Promise.all([
      fetchSingapore(bbox, limit),
      fetchDatumfeed(bbox, kind, limit)
    ]);

    let cameras = sg.concat(df);
    if (kind === "intersection") {
      cameras = cameras.filter(function (c) {
        return c.kind === "intersection" || c.source === "singapore-lta";
      });
    } else if (kind === "live") {
      cameras = cameras.filter(function (c) {
        return c.kind === "public_live" || c.source === "singapore-lta";
      });
    }

    cameras = cameras.slice(0, limit);

    return send(res, 200, {
      ok: true,
      available: cameras.length > 0,
      count: cameras.length,
      fetched_at: new Date().toISOString(),
      sources: [
        {
          id: "singapore-lta",
          license: "Singapore Open Data Licence",
          commercial_ok: true,
          coverage: "Singapore expressways / roads (LTA traffic images)"
        },
        {
          id: "datumfeed-commercial",
          license: "Per-registry open licences with commercialOk=true only",
          commercial_ok: true,
          coverage:
            "Austin TX, Ontario 511, TfL London JamCams, Toronto city cameras (Datumfeed index)",
          note:
            "Registries with unknown commercialOk (Caltrans, WSDOT, Ottawa) are excluded."
        }
      ],
      message:
        cameras.length > 0
          ? ""
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
