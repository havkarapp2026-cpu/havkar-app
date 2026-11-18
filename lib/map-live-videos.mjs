/**
 * Curated YouTube Live public webcams only.
 * Playback uses official YouTube embed (uploader-controlled).
 * Never invents streams. Periodic JPEG traffic cams belong in map-public-cameras.
 * Supports optional lat/lng/radius_km location search with distance sort.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { haversineKm, parseLatLngRadius } = require("./map-geo-util.cjs");

const TIMEOUT_MS = 8000;

/** Allowlist: verified public tourism / city webcams published as YouTube Live. */
const CURATED = [
  {
    id: "yt-venice-rolling",
    youtube_id: "a1mcaV3Sf9U",
    name: "Venice Rolling Cam",
    place: "Venice historic centre",
    city: "Venice",
    country: "IT",
    category: "tourism",
    latitude: 45.4408,
    longitude: 12.3155,
    attribution: "I Love You Venice (YouTube Live)",
    license: "YouTube embed — watch via official player",
    source_url: "https://www.youtube.com/watch?v=a1mcaV3Sf9U"
  },
  {
    id: "yt-venice-guglie",
    youtube_id: "mt7uE-n0YPI",
    name: "Venice Ponte delle Guglie",
    place: "Ponte delle Guglie / Strada Nova",
    city: "Venice",
    country: "IT",
    category: "street",
    latitude: 45.4435,
    longitude: 12.3255,
    attribution: "I Love You Venice (YouTube Live)",
    license: "YouTube embed — watch via official player",
    source_url: "https://www.youtube.com/watch?v=mt7uE-n0YPI"
  },
  {
    id: "yt-rome-venezia",
    youtube_id: "0ovLESyVR-g",
    name: "Rome Piazza Venezia",
    place: "Piazza Venezia",
    city: "Rome",
    country: "IT",
    category: "square",
    latitude: 41.9029,
    longitude: 12.4833,
    attribution: "Roma Five Suites (YouTube Live)",
    license: "YouTube embed — watch via official player",
    source_url: "https://www.youtube.com/watch?v=0ovLESyVR-g"
  },
  {
    id: "yt-florence-skyline",
    youtube_id: "yhJEW02TfZU",
    name: "Florence skyline",
    place: "Florence rooftops",
    city: "Florence",
    country: "IT",
    category: "tourism",
    latitude: 43.7696,
    longitude: 11.2558,
    attribution: "webcamfirenze (YouTube Live)",
    license: "YouTube embed — watch via official player",
    source_url: "https://www.youtube.com/watch?v=yhJEW02TfZU"
  },
  {
    id: "yt-naples-gulf",
    youtube_id: "RbI8JwrBZQA",
    name: "Naples Gulf / Vesuvius",
    place: "Gulf of Naples",
    city: "Naples",
    country: "IT",
    category: "coast",
    latitude: 40.8518,
    longitude: 14.2681,
    attribution: "Paesaggi Digitali (YouTube Live)",
    license: "YouTube embed — watch via official player",
    source_url: "https://www.youtube.com/watch?v=RbI8JwrBZQA"
  },
  {
    id: "yt-tokyo-shinjuku",
    youtube_id: "GLQhbRGv5qU",
    name: "Tokyo Shinjuku area",
    place: "Shinjuku",
    city: "Tokyo",
    country: "JP",
    category: "street",
    latitude: 35.6938,
    longitude: 139.7034,
    attribution: "YouTube Live public webcam",
    license: "YouTube embed — watch via official player",
    source_url: "https://www.youtube.com/watch?v=GLQhbRGv5qU"
  },
  {
    id: "yt-nyc-times-square",
    youtube_id: "ZxCeWQ3Lcig",
    name: "New York Times Square",
    place: "Times Square",
    city: "New York",
    country: "US",
    category: "square",
    latitude: 40.758,
    longitude: -73.9855,
    attribution: "YouTube Live public webcam",
    license: "YouTube embed — watch via official player",
    source_url: "https://www.youtube.com/watch?v=ZxCeWQ3Lcig"
  },
  {
    id: "yt-paris-live",
    youtube_id: "YkKGantlWH0",
    name: "Paris live view",
    place: "Paris",
    city: "Paris",
    country: "FR",
    category: "tourism",
    latitude: 48.8566,
    longitude: 2.3522,
    attribution: "YouTube Live public webcam",
    license: "YouTube embed — watch via official player",
    source_url: "https://www.youtube.com/watch?v=YkKGantlWH0"
  }
];

const CATEGORIES = [
  "street",
  "market",
  "intersection",
  "highway",
  "square",
  "tourism",
  "coast",
  "airport",
  "weather"
];

function send(res, status, body) {
  res.setHeader("Cache-Control", "public, max-age=120");
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
  return { west: west, south: south, east: east, north: north };
}

function inBbox(lat, lon, bbox) {
  if (!bbox) return true;
  return (
    lat >= bbox.south &&
    lat <= bbox.north &&
    lon >= bbox.west &&
    lon <= bbox.east
  );
}

async function probeLive(youtubeId) {
  try {
    const response = await fetch(
      "https://www.youtube.com/oembed?url=" +
        encodeURIComponent("https://www.youtube.com/watch?v=" + youtubeId) +
        "&format=json",
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!response.ok) {
      return { ok: false, live: false };
    }
    const body = await response.json();
    return {
      ok: true,
      live: true,
      title: body.title || "",
      author: body.author_name || ""
    };
  } catch (_e) {
    return { ok: false, live: false };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const bbox = parseBbox(req.query && req.query.bbox);
  const near = parseLatLngRadius(req.query || {});
  const category = String((req.query && req.query.category) || "all").toLowerCase();
  const country = String((req.query && req.query.country) || "all").toUpperCase();
  const city = String((req.query && req.query.city) || "all").toLowerCase();
  const probe = String((req.query && req.query.probe) || "") === "1";
  const activeOnly = String((req.query && req.query.active) || "") === "1";
  let limit = Number((req.query && req.query.limit) || 40);
  if (!Number.isFinite(limit) || limit < 1) limit = 40;
  limit = Math.min(60, Math.floor(limit));

  let rows = CURATED.slice();
  if (category !== "all") {
    rows = rows.filter(function (r) {
      return r.category === category;
    });
  }
  if (country !== "ALL") {
    rows = rows.filter(function (r) {
      return r.country === country;
    });
  }
  if (city !== "all") {
    rows = rows.filter(function (r) {
      return String(r.city || "").toLowerCase() === city;
    });
  }
  if (bbox) {
    rows = rows.filter(function (r) {
      return inBbox(r.latitude, r.longitude, bbox);
    });
  }
  if (near) {
    rows = rows
      .map(function (r) {
        const km = haversineKm(near.lat, near.lng, r.latitude, r.longitude);
        return Object.assign({}, r, { _distance_km: km });
      })
      .filter(function (r) {
        return r._distance_km <= near.radius_km;
      })
      .sort(function (a, b) {
        return a._distance_km - b._distance_km;
      });
  }

  const cameras = [];
  for (const row of rows.slice(0, limit)) {
    let live = null;
    let title = row.name;
    if (probe || activeOnly) {
      const p = await probeLive(row.youtube_id);
      live = p.ok;
      if (p.title) title = p.title;
      if (activeOnly && !p.ok) continue;
    }
    cameras.push({
      id: row.id,
      name: title,
      place: row.place,
      city: row.city,
      country: row.country,
      category: row.category,
      latitude: row.latitude,
      longitude: row.longitude,
      distance_km:
        row._distance_km != null ? Math.round(row._distance_km * 100) / 100 : null,
      distance_m:
        row._distance_km != null ? Math.round(row._distance_km * 1000) : null,
      kind: "live_video",
      feed_type: "youtube_live",
      live_stream: true,
      youtube_id: row.youtube_id,
      embed_url:
        "https://www.youtube-nocookie.com/embed/" +
        encodeURIComponent(row.youtube_id) +
        "?playsinline=1&rel=0&modestbranding=1&enablejsapi=1",
      watch_url: row.source_url,
      attribution: row.attribution,
      license: row.license,
      status: probe || activeOnly ? (live ? "live" : "unavailable") : "curated",
      updated_at: new Date().toISOString()
    });
  }

  return send(res, 200, {
    ok: true,
    available: cameras.length > 0,
    count: cameras.length,
    fetched_at: new Date().toISOString(),
    search:
      near
        ? {
            mode: "location_radius",
            latitude: near.lat,
            longitude: near.lng,
            radius_km: near.radius_km
          }
        : bbox
          ? { mode: "bbox" }
          : { mode: "global_curated" },
    categories: CATEGORIES,
    sources: ["YouTube Live (curated public webcams)"],
    message:
      cameras.length > 0
        ? ""
        : near
          ? "No curated live video webcams within " +
            near.radius_km +
            " km of this place. Coverage is not worldwide."
          : "No curated live video webcams match this filter / map area.",
    honesty:
      "Live video uses official YouTube embeds of public tourism webcams. JPEG traffic snapshots are a separate layer and are never labeled as live video. Recorded uploads are never marketed as live.",
    cameras: cameras
  });
}
