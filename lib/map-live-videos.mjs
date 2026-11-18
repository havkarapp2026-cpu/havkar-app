/**
 * Curated YouTube Live public webcams — validated before listing.
 * Playback uses official YouTube embed (uploader-controlled).
 * Status: LIVE (verified) | UNKNOWN (bot-check / inconclusive) | OFFLINE family.
 * UNKNOWN is never labeled verified LIVE. Official watch URL always available.
 * Never invents streams. JPEG traffic cams belong in map-public-cameras.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { haversineKm, parseLatLngRadius } = require("./map-geo-util.cjs");
const { probeYouTubeLive, youtubeApiKey } = require("./youtube-live-probe.cjs");
const { listCameraSources } = require("./map-camera-sources.cjs");

/** Allowlist candidates only — still require live probe before verified LIVE display. */
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

function availabilityOf(probe) {
  if (probe && probe.live) return "live";
  if (probe && probe.availability) return probe.availability;
  if (probe && probe.status === "unknown") return "unknown";
  return "offline";
}

function toCamera(row, probe, distanceKm) {
  const live = !!(probe && probe.live);
  const availability = availabilityOf(probe);
  const watchUrl =
    (probe && probe.watch_url) ||
    row.source_url ||
    "https://www.youtube.com/watch?v=" + encodeURIComponent(row.youtube_id);
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
    /* Official source always available — including UNKNOWN / OFFLINE */
    watch_url: watchUrl,
    source_url: watchUrl,
    attribution: row.attribution,
    license: row.license,
    status: live ? "live" : (probe && probe.status) || "unavailable",
    availability: availability,
    probe_reason: (probe && probe.reason) || "",
    probed_at: (probe && probe.probed_at) || null,
    official_api_configured: !!(probe && probe.official_api_configured),
    official_open_required: !live,
    updated_at: new Date().toISOString()
  };
}

async function collectLiveAlternatives(excludeId, near) {
  const liveRows = [];
  for (const cand of CURATED) {
    if (excludeId && cand.id === excludeId) continue;
    const p = await probeYouTubeLive(cand.youtube_id);
    if (!p.live) continue;
    const dist = near
      ? haversineKm(near.lat, near.lng, cand.latitude, cand.longitude)
      : null;
    liveRows.push(toCamera(cand, p, dist));
  }
  return liveRows
    .sort(function (a, b) {
      const da = a.distance_km == null ? Infinity : a.distance_km;
      const db = b.distance_km == null ? Infinity : b.distance_km;
      return da - db;
    })
    .slice(0, 5);
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
      alternatives = await collectLiveAlternatives(row && row.id, near);
    }
    const camera = row
      ? toCamera(
          row,
          probe,
          near ? haversineKm(near.lat, near.lng, row.latitude, row.longitude) : null
        )
      : {
          youtube_id: validateId,
          watch_url: probe.watch_url || "https://www.youtube.com/watch?v=" + encodeURIComponent(validateId),
          status: probe.status,
          availability: availabilityOf(probe),
          live_stream: false,
          embed_url: null,
          official_open_required: true
        };
    return send(res, 200, {
      ok: true,
      live: probe.live === true,
      availability: availabilityOf(probe),
      camera: camera,
      probe: probe,
      alternatives: alternatives,
      official_api_configured: Boolean(youtubeApiKey()),
      honesty:
        "Only streams confirmed live right now are offered as verified LIVE video. Bot-check / inconclusive probes are UNKNOWN (open official YouTube). Recordings and ended broadcasts are never labeled live.",
      fetched_at: new Date().toISOString()
    });
  }

  const bbox = parseBbox(q.bbox);
  const near = parseLatLngRadius(q);
  const category = String(q.category || "all").toLowerCase();
  const country = String(q.country || "all").toUpperCase();
  const city = String(q.city || "all").toLowerCase();
  /* Default: confirmed-live. include_unknown=1 also lists UNKNOWN (never as LIVE). */
  const includeInactive = String(q.include_inactive || "") === "1";
  const includeUnknown = String(q.include_unknown || "1") !== "0";
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

  const liveList = [];
  const unknownList = [];
  const offlineList = [];
  for (const row of rows) {
    const probe = await probeYouTubeLive(row.youtube_id);
    const cam = toCamera(row, probe, row._distance_km);
    if (probe.live) liveList.push(cam);
    else if (availabilityOf(probe) === "unknown") unknownList.push(cam);
    else offlineList.push(cam);
  }

  let cameras;
  if (activeOnly) {
    cameras = liveList.slice();
    if (includeUnknown) cameras = cameras.concat(unknownList);
  } else {
    cameras = liveList.concat(unknownList, offlineList);
  }

  let searchMode = near
    ? { mode: "location_radius", latitude: near.lat, longitude: near.lng, radius_km: radiusKm }
    : bbox
      ? { mode: "bbox" }
      : { mode: "global_curated" };
  let expanded = false;

  if (near && radiusKm != null) {
    const inRadius = cameras.filter(function (c) {
      return c.distance_km != null && c.distance_km <= radiusKm;
    });
    if (inRadius.length) {
      cameras = inRadius;
    } else if (expandIfEmpty && activeOnly) {
      cameras = liveList.concat(includeUnknown ? unknownList : []).slice(0, limit);
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

  /* Prefer verified LIVE, then UNKNOWN, then by distance */
  cameras = cameras
    .slice()
    .sort(function (a, b) {
      const rank = function (c) {
        if (c.live_stream && c.status === "live") return 0;
        if (c.availability === "unknown") return 1;
        return 2;
      };
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      const da = a.distance_km == null ? Infinity : a.distance_km;
      const db = b.distance_km == null ? Infinity : b.distance_km;
      return da - db;
    })
    .slice(0, limit);

  let message = "";
  if (!cameras.length) {
    message = near
      ? "No confirmed live or status-unknown YouTube webcams near this place right now. Coverage is curated (not worldwide) and ended links are hidden."
      : "No confirmed live or status-unknown YouTube webcams are online in the curated allowlist right now.";
  } else if (expanded) {
    message =
      "No matching webcam inside " +
      radiusKm +
      " km. Showing nearest curated cameras instead (LIVE first, then UNKNOWN).";
  }

  return send(res, 200, {
    ok: true,
    available: cameras.length > 0,
    count: cameras.length,
    active_count: liveList.length,
    unknown_count: unknownList.length,
    inactive_count: offlineList.length,
    fetched_at: new Date().toISOString(),
    search: searchMode,
    expanded_beyond_radius: expanded,
    categories: CATEGORIES,
    sources: listCameraSources().filter(function (s) {
      return s.id === "youtube-curated-live";
    }),
    official_api_configured: Boolean(youtubeApiKey()),
    message: message,
    honesty:
      "Verified LIVE only when probe confirms a live broadcast. UNKNOWN (e.g. YouTube bot-check) is never labeled LIVE — open the official YouTube link. Ended recordings are excluded from the active list.",
    cameras: cameras,
    inactive_sample: includeInactive ? offlineList.slice(0, 10) : undefined
  });
}
