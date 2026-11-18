/**
 * Curated YouTube Live public webcams only — validated before listing.
 * Playback uses official YouTube embed (uploader-controlled).
 * Ended / deleted / VOD streams are excluded from the active live list.
 * Never invents streams. JPEG traffic cams belong in map-public-cameras.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { haversineKm, parseLatLngRadius } = require("./map-geo-util.cjs");
const { probeYouTubeLive } = require("./youtube-live-probe.cjs");

/** Allowlist candidates only — still require live probe before display. */
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

function toCamera(row, probe, distanceKm) {
  const live = !!(probe && probe.live);
  return {
    id: row.id,
    name: (probe && probe.title) || row.name,
    place: row.place,
    city: row.city,
    country: row.country,
    category: row.category,
    latitude: row.latitude,
    longitude: row.longitude,
    distance_km:
      distanceKm != null && Number.isFinite(distanceKm)
        ? Math.round(distanceKm * 100) / 100
        : null,
    distance_m:
      distanceKm != null && Number.isFinite(distanceKm)
        ? Math.round(distanceKm * 1000)
        : null,
    kind: "live_video",
    feed_type: "youtube_live",
    /* Only true when probe confirmed live right now */
    live_stream: live,
    youtube_id: row.youtube_id,
    embed_url: live
      ? "https://www.youtube-nocookie.com/embed/" +
        encodeURIComponent(row.youtube_id) +
        "?playsinline=1&rel=0&modestbranding=1&enablejsapi=1"
      : null,
    watch_url: live ? row.source_url : null,
    attribution: row.attribution,
    license: row.license,
    status: live ? "live" : (probe && probe.status) || "unavailable",
    probe_reason: (probe && probe.reason) || "",
    probed_at: (probe && probe.probed_at) || null,
    updated_at: new Date().toISOString()
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const q = req.query || {};
  const validateId = String(q.validate || q.youtube_id || "").trim();
  if (validateId) {
    const row =
      CURATED.find(function (r) {
        return r.youtube_id === validateId || r.id === validateId;
      }) || null;
    const probe = await probeYouTubeLive(row ? row.youtube_id : validateId);
    const near = parseLatLngRadius(q);
    let alternatives = [];
    if (!probe.live) {
      const liveRows = [];
      for (const cand of CURATED) {
        if (row && cand.id === row.id) continue;
        const p = await probeYouTubeLive(cand.youtube_id);
        if (!p.live) continue;
        const dist = near
          ? haversineKm(near.lat, near.lng, cand.latitude, cand.longitude)
          : null;
        liveRows.push(toCamera(cand, p, dist));
      }
      alternatives = liveRows
        .sort(function (a, b) {
          const da = a.distance_km == null ? Infinity : a.distance_km;
          const db = b.distance_km == null ? Infinity : b.distance_km;
          return da - db;
        })
        .slice(0, 5);
    }
    return send(res, 200, {
      ok: true,
      live: probe.live === true,
      camera: row ? toCamera(row, probe, near ? haversineKm(near.lat, near.lng, row.latitude, row.longitude) : null) : null,
      probe: probe,
      alternatives: alternatives,
      honesty:
        "Only streams confirmed live right now are offered as live video. Recordings and ended broadcasts are never labeled live.",
      fetched_at: new Date().toISOString()
    });
  }

  const bbox = parseBbox(q.bbox);
  const near = parseLatLngRadius(q);
  const category = String(q.category || "all").toLowerCase();
  const country = String(q.country || "all").toUpperCase();
  const city = String(q.city || "all").toLowerCase();
  /* Default: only confirmed-live cameras. include_inactive=1 keeps diagnostics. */
  const includeInactive = String(q.include_inactive || "") === "1";
  const activeOnly = String(q.active || "1") !== "0" && !includeInactive;
  let limit = Number(q.limit || 40);
  if (!Number.isFinite(limit) || limit < 1) limit = 40;
  limit = Math.min(60, Math.floor(limit));
  const radiusKm = near ? near.radius_km : null;
  const expandIfEmpty = String(q.expand || "1") !== "0";

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

  /* Always attach distance when a map center is known (even outside radius). */
  if (near) {
    rows = rows
      .map(function (r) {
        const km = haversineKm(near.lat, near.lng, r.latitude, r.longitude);
        return Object.assign({}, r, { _distance_km: km });
      })
      .sort(function (a, b) {
        return a._distance_km - b._distance_km;
      });
  }

  const probed = [];
  const inactive = [];
  for (const row of rows) {
    const probe = await probeYouTubeLive(row.youtube_id);
    const cam = toCamera(row, probe, row._distance_km);
    if (probe.live) probed.push(cam);
    else inactive.push(cam);
  }

  let cameras = activeOnly ? probed.slice() : probed.concat(inactive);
  let searchMode = near
    ? { mode: "location_radius", latitude: near.lat, longitude: near.lng, radius_km: radiusKm }
    : bbox
      ? { mode: "bbox" }
      : { mode: "global_curated" };
  let expanded = false;

  if (near && radiusKm != null) {
    const inRadius = cameras.filter(function (c) {
      return c.live_stream && c.distance_km != null && c.distance_km <= radiusKm;
    });
    if (inRadius.length) {
      cameras = inRadius;
    } else if (expandIfEmpty && activeOnly) {
      /* No live cam inside radius — still show nearest confirmed-live cams globally. */
      cameras = probed.slice(0, limit);
      expanded = true;
      searchMode = {
        mode: "nearest_active_global",
        latitude: near.lat,
        longitude: near.lng,
        requested_radius_km: radiusKm
      };
    } else {
      cameras = [];
    }
  }

  cameras = cameras.slice(0, limit);

  let message = "";
  if (!cameras.length) {
    message = near
      ? "No confirmed live webcams are online near this place right now. Coverage is not worldwide and ended YouTube links are hidden."
      : "No confirmed live webcams are online in the curated allowlist right now.";
  } else if (expanded) {
    message =
      "No live webcam inside " +
      radiusKm +
      " km. Showing nearest confirmed-live cameras instead (distance sorted).";
  }

  return send(res, 200, {
    ok: true,
    available: cameras.length > 0,
    count: cameras.length,
    active_count: probed.length,
    inactive_count: inactive.length,
    fetched_at: new Date().toISOString(),
    search: searchMode,
    expanded_beyond_radius: expanded,
    categories: CATEGORIES,
    sources: ["YouTube Live (curated allowlist + live probe)"],
    message: message,
    honesty:
      "Only YouTube broadcasts confirmed live at probe time are labeled LIVE. Ended recordings, deleted videos, and regular uploads are excluded from the active live list.",
    cameras: cameras,
    inactive_sample: includeInactive ? inactive.slice(0, 10) : undefined
  });
}
