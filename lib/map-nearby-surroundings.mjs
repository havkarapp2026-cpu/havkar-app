/**
 * Location-based surroundings for Hotels / Tickets maps:
 * - Licensed public cameras (intersection JPEG + curated live video)
 * - Wikimedia Commons geosearch photos (attribution required)
 * - Honest Street View status (no fake 360)
 * Sorted by distance from the destination. Never invents feeds.
 */

import { createRequire } from "node:module";
import streetViewHandler from "./map-street-view.mjs";

const require = createRequire(import.meta.url);
const { haversineKm, bboxFromRadiusKm, parseLatLngRadius } = require("./map-geo-util.cjs");

const TIMEOUT_MS = 12000;
const MAX_CAMS = 40;
const MAX_PHOTOS = 16;

function send(res, status, body) {
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(status).json(body);
}

function withDistance(rows, lat, lng) {
  return (rows || [])
    .map(function (row) {
      const plat = Number(row.latitude);
      const plng = Number(row.longitude);
      if (!Number.isFinite(plat) || !Number.isFinite(plng)) return null;
      const km = haversineKm(lat, lng, plat, plng);
      return Object.assign({}, row, {
        distance_km: Math.round(km * 100) / 100,
        distance_m: Math.round(km * 1000)
      });
    })
    .filter(Boolean)
    .sort(function (a, b) {
      return a.distance_km - b.distance_km;
    });
}

async function loadIntersection(bbox, limit) {
  const url =
    "https://api.data.gov.sg/v1/transport/traffic-images";
  /* Reuse map-public-cameras via internal import would recurse HTTP; call SG + Datumfeed lightly here. */
  const camsMod = await import("./map-public-cameras.mjs");
  /* Direct fetch through handler mock */
  const out = { statusCode: 0, body: null };
  const res = {
    setHeader() {},
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(body) {
      out.body = body;
      return this;
    }
  };
  await camsMod.default(
    {
      method: "GET",
      query: {
        bbox: [bbox.west, bbox.south, bbox.east, bbox.north].join(","),
        kind: "all",
        limit: String(limit)
      }
    },
    res
  );
  return (out.body && out.body.cameras) || [];
}

async function loadLiveVideos(lat, lng, radiusKm, limit, activeOnly) {
  const videosMod = await import("./map-live-videos.mjs");
  const out = { statusCode: 0, body: null };
  const res = {
    setHeader() {},
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(body) {
      out.body = body;
      return this;
    }
  };
  await videosMod.default(
    {
      method: "GET",
      query: {
        lat: String(lat),
        lng: String(lng),
        radius_km: String(radiusKm),
        limit: String(limit),
        active: activeOnly ? "1" : "0"
      }
    },
    res
  );
  return (out.body && out.body.cameras) || [];
}

async function loadWikimediaPhotos(lat, lng, radiusKm) {
  const meters = Math.min(Math.max(Math.round(radiusKm * 1000), 200), 10000);
  const geoUrl =
    "https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gscoord=" +
    encodeURIComponent(lat + "|" + lng) +
    "&gsradius=" +
    meters +
    "&gslimit=" +
    MAX_PHOTOS +
    "&format=json";
  try {
    const geoRes = await fetch(geoUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "HAVKAR-App/1.0 (https://havkar.online; accommodations-surroundings)"
      },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!geoRes.ok) return [];
    const geoBody = await geoRes.json();
    const pages = (geoBody && geoBody.query && geoBody.query.geosearch) || [];
    if (!pages.length) return [];
    const ids = pages
      .map(function (p) {
        return p.pageid;
      })
      .filter(Boolean)
      .join("|");
    if (!ids) return [];
    const infoUrl =
      "https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata|size|mime&pageids=" +
      encodeURIComponent(ids) +
      "&iiurlwidth=640&format=json";
    const infoRes = await fetch(infoUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "HAVKAR-App/1.0 (https://havkar.online; accommodations-surroundings)"
      },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!infoRes.ok) return [];
    const infoBody = await infoRes.json();
    const byId = (infoBody && infoBody.query && infoBody.query.pages) || {};
    const photos = [];
    pages.forEach(function (p) {
      const page = byId[String(p.pageid)];
      const ii = page && Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
      if (!ii || !ii.url) return;
      const meta = ii.extmetadata || {};
      const artist =
        (meta.Artist && (meta.Artist.value || meta.Artist)) ||
        (meta.Credit && (meta.Credit.value || meta.Credit)) ||
        "Wikimedia Commons";
      const license =
        (meta.LicenseShortName && (meta.LicenseShortName.value || meta.LicenseShortName)) ||
        (meta.License && (meta.License.value || meta.License)) ||
        "See Commons page";
      const distKm = Number.isFinite(Number(p.dist)) ? Number(p.dist) / 1000 : haversineKm(lat, lng, p.lat, p.lon);
      photos.push({
        id: "wm-" + p.pageid,
        title: p.title || page.title || "Nearby photo",
        latitude: Number(p.lat),
        longitude: Number(p.lon),
        distance_km: Math.round(distKm * 100) / 100,
        distance_m: Math.round(distKm * 1000),
        image_url: ii.thumburl || ii.url,
        full_url: ii.url,
        page_url: "https://commons.wikimedia.org/?curid=" + p.pageid,
        attribution: String(artist).replace(/<[^>]+>/g, "").slice(0, 240),
        license: String(license).replace(/<[^>]+>/g, "").slice(0, 120),
        source: "wikimedia_commons",
        live: false
      });
    });
    return photos.sort(function (a, b) {
      return a.distance_km - b.distance_km;
    });
  } catch (_e) {
    return [];
  }
}

async function streetViewStatus() {
  const out = { statusCode: 0, body: null };
  const res = {
    setHeader() {},
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(body) {
      out.body = body;
      return this;
    }
  };
  await streetViewHandler({ method: "GET", query: {} }, res);
  return out.body || { available: false, interactive_360: false };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const parsed = parseLatLngRadius(req.query || {});
  if (!parsed) {
    return send(res, 400, {
      ok: false,
      error: "invalid_location",
      message: "Provide lat, lng and optional radius_km (0.2–40)."
    });
  }

  const activeOnly = String((req.query && req.query.active) || "") === "1";
  const bbox = bboxFromRadiusKm(parsed.lat, parsed.lng, parsed.radius_km);
  if (!bbox) {
    return send(res, 400, { ok: false, error: "invalid_bbox" });
  }

  try {
    const [intersection, live, photos, street] = await Promise.all([
      loadIntersection(bbox, MAX_CAMS),
      loadLiveVideos(parsed.lat, parsed.lng, parsed.radius_km, MAX_CAMS, activeOnly),
      loadWikimediaPhotos(parsed.lat, parsed.lng, parsed.radius_km),
      streetViewStatus()
    ]);

    let cameras = withDistance(intersection.concat(live), parsed.lat, parsed.lng).filter(
      function (c) {
        return c.distance_km <= parsed.radius_km + 0.05;
      }
    );
    if (activeOnly) {
      cameras = cameras.filter(function (c) {
        if (c.live_stream) return c.status !== "unavailable";
        return Boolean(c.image_url || c.frame_proxy);
      });
    }
    cameras = cameras.slice(0, MAX_CAMS);

    return send(res, 200, {
      ok: true,
      available: true,
      free_for_users: true,
      center: { latitude: parsed.lat, longitude: parsed.lng },
      radius_km: parsed.radius_km,
      fetched_at: new Date().toISOString(),
      cameras: cameras,
      camera_count: cameras.length,
      photos: photos,
      photo_count: photos.length,
      street_view: street,
      coverage: {
        cameras:
          "Licensed public cameras only (Singapore LTA, Datumfeed commercialOk cities, curated YouTube Live). Many world regions have zero licensed cameras.",
        photos:
          "Wikimedia Commons geosearch — only real licensed images with attribution. Empty means no Commons coverage nearby.",
        street_view:
          "Interactive 360 requires Google Street View or Mapillary keys + Owner commercial approval. Not fabricated."
      },
      message:
        cameras.length || photos.length
          ? ""
          : "No licensed cameras or Commons photos found within " +
            parsed.radius_km +
            " km. Use satellite / hybrid map layers."
    });
  } catch (_e) {
    return send(res, 502, {
      ok: false,
      error: "surroundings_network",
      message: "Surroundings lookup is not available right now."
    });
  }
}
