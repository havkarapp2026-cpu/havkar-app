/**
 * Hotel / place Street View gate + live lookup.
 *
 * Providers (Owner-approved free paths only):
 * 1) Mapillary Graph API + mapillary-js — free platform, needs Client Token
 *    env: HAVKAR_MAPILLARY_ACCESS_TOKEN | MAPILLARY_ACCESS_TOKEN
 * 2) Google Maps Embed API streetview mode — $0 usage, but Google Cloud
 *    billing account is required to create the key (Owner must approve that setup)
 *    env: HAVKAR_GOOGLE_MAPS_EMBED_API_KEY | GOOGLE_MAPS_EMBED_API_KEY
 *         | HAVKAR_GOOGLE_MAPS_API_KEY | GOOGLE_MAPS_API_KEY
 *
 * Never fabricates panoramas. Keys stay server-side for Graph lookups;
 * Mapillary Client Token may be returned for official mapillary-js (designed for browser).
 * Google Embed key appears only inside Embed iframe URL (restrict by HTTP referrer).
 */

const TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 2 * 60 * 1000;
const nearbyCache = new Map();

function send(res, status, body) {
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(status).json(body);
}

function readKey(name) {
  return String(process.env[name] || "").trim();
}

function mapillaryToken() {
  return readKey("HAVKAR_MAPILLARY_ACCESS_TOKEN") || readKey("MAPILLARY_ACCESS_TOKEN");
}

function googleEmbedKey() {
  return (
    readKey("HAVKAR_GOOGLE_MAPS_EMBED_API_KEY") ||
    readKey("GOOGLE_MAPS_EMBED_API_KEY") ||
    readKey("HAVKAR_GOOGLE_MAPS_API_KEY") ||
    readKey("GOOGLE_MAPS_API_KEY")
  );
}

function parseLatLng(q) {
  const lat = Number(q && (q.lat != null ? q.lat : q.latitude));
  const lng = Number(q && (q.lng != null ? q.lng : q.longitude));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: lat, lng: lng };
}

function cacheGet(key) {
  const hit = nearbyCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    nearbyCache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  nearbyCache.set(key, { value: value, expires: Date.now() + CACHE_TTL_MS });
}

function haversineM(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function requiredSecrets() {
  return [
    {
      name: "HAVKAR_MAPILLARY_ACCESS_TOKEN",
      aliases: ["MAPILLARY_ACCESS_TOKEN"],
      provider: "mapillary",
      cost: "free",
      payment_account_required: false,
      how:
        "Create a free Mapillary developer app at https://www.mapillary.com/dashboard/developers and copy the Client Token into Vercel Production/Preview as HAVKAR_MAPILLARY_ACCESS_TOKEN (server secret).",
      license: "Mapillary Terms + User Content typically CC BY-SA; commercial use allowed for product improvement / client services with re-ID safeguards."
    },
    {
      name: "HAVKAR_GOOGLE_MAPS_EMBED_API_KEY",
      aliases: ["GOOGLE_MAPS_EMBED_API_KEY", "HAVKAR_GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_API_KEY"],
      provider: "google_maps_embed",
      cost: "Maps Embed API usage is $0 / unlimited",
      payment_account_required: true,
      payment_account_note:
        "Google Cloud requires a billing account to create an API key even though Embed Street View usage is free. Do not enable paid Street View Static / Maps JS without Owner approval.",
      how:
        "In Google Cloud: enable Maps Embed API only, create an API key restricted to HTTP referrers https://havkar.online/* and https://*.vercel.app/*, store as HAVKAR_GOOGLE_MAPS_EMBED_API_KEY.",
      license: "Google Maps Platform Terms / Embed API"
    }
  ];
}

function providerStatus() {
  const mly = Boolean(mapillaryToken());
  const g = Boolean(googleEmbedKey());
  return [
    {
      id: "mapillary",
      display_name: "Mapillary",
      configured: mly,
      interactive_360: mly,
      free_platform: true,
      paid: false,
      signup_url: "https://www.mapillary.com/dashboard/developers",
      commercial_note:
        "Mapillary is free for commercial product use under its Terms (CC BY-SA user content + safeguards). Client Token required."
    },
    {
      id: "google_maps_embed_streetview",
      display_name: "Google Maps Embed Street View",
      configured: g,
      interactive_360: g,
      free_platform: false,
      paid: false,
      usage_cost_usd: 0,
      billing_account_required: true,
      signup_url: "https://developers.google.com/maps/documentation/embed/get-started",
      commercial_note:
        "Embed Street View usage is free/unlimited, but creating the Google Cloud key requires a billing account. Not armed until Owner adds HAVKAR_GOOGLE_MAPS_EMBED_API_KEY. Do not enable paid Static Street View."
    }
  ];
}

async function fetchMapillaryNearby(lat, lng, radiusM, limit) {
  const token = mapillaryToken();
  if (!token) {
    return {
      ok: false,
      reason: "mapillary_token_missing",
      failure_kind: "missing_key",
      images: []
    };
  }
  /* Mapillary Graph lat/lng radius: start tight, allow expand up to 1000 m. */
  const r = Math.min(Math.max(Number(radiusM) || 50, 5), 1000);
  const lim = Math.min(Math.max(Number(limit) || 12, 1), 40);
  const cacheKey = "mly:" + lat.toFixed(5) + "," + lng.toFixed(5) + ":" + r + ":" + lim;
  const cached = cacheGet(cacheKey);
  if (cached) return Object.assign({}, cached, { cached: true });

  const fields = [
    "id",
    "geometry",
    "computed_geometry",
    "captured_at",
    "compass_angle",
    "computed_compass_angle",
    "is_pano",
    "sequence",
    "thumb_1024_url",
    "thumb_2048_url",
    "width",
    "height",
    "camera_type"
  ].join(",");

  const url =
    "https://graph.mapillary.com/images?access_token=" +
    encodeURIComponent(token) +
    "&fields=" +
    encodeURIComponent(fields) +
    "&lat=" +
    encodeURIComponent(String(lat)) +
    "&lng=" +
    encodeURIComponent(String(lng)) +
    "&radius=" +
    encodeURIComponent(String(r)) +
    "&limit=" +
    encodeURIComponent(String(lim));

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const body = await res.json().catch(function () {
      return null;
    });
    if (!res.ok) {
      const authFail = res.status === 401 || res.status === 403;
      return {
        ok: false,
        reason: authFail ? "mapillary_auth_failed" : "mapillary_http_" + res.status,
        failure_kind: authFail ? "api_auth" : "api_error",
        error_message: body && body.error && body.error.message ? body.error.message : "",
        images: []
      };
    }
    const rows = body && Array.isArray(body.data) ? body.data : [];
    const images = rows
      .map(function (img) {
        const geom =
          (img.computed_geometry && img.computed_geometry.coordinates) ||
          (img.geometry && img.geometry.coordinates) ||
          null;
        if (!geom || geom.length < 2) return null;
        const ilng = Number(geom[0]);
        const ilat = Number(geom[1]);
        if (!Number.isFinite(ilat) || !Number.isFinite(ilng)) return null;
        const seq =
          img.sequence && typeof img.sequence === "object"
            ? img.sequence.id || img.sequence
            : img.sequence || null;
        return {
          id: String(img.id),
          latitude: ilat,
          longitude: ilng,
          distance_m: Math.round(haversineM(lat, lng, ilat, ilng)),
          captured_at: img.captured_at || null,
          compass_angle:
            img.computed_compass_angle != null ? img.computed_compass_angle : img.compass_angle,
          is_pano: img.is_pano === true || String(img.camera_type || "") === "equirectangular",
          sequence_id: seq != null ? String(seq) : null,
          thumb_url: img.thumb_2048_url || img.thumb_1024_url || null,
          thumb_1024_url: img.thumb_1024_url || null,
          camera_type: img.camera_type || null,
          attribution: "Mapillary contributors (CC BY-SA)",
          license: "CC BY-SA",
          source_url: "https://www.mapillary.com/app/?pKey=" + encodeURIComponent(String(img.id))
        };
      })
      .filter(Boolean)
      .sort(function (a, b) {
        if (a.is_pano !== b.is_pano) return a.is_pano ? -1 : 1;
        return a.distance_m - b.distance_m;
      });

    const out = {
      ok: true,
      reason: images.length ? "mapillary_coverage" : "mapillary_no_coverage_nearby",
      failure_kind: images.length ? "ok" : "no_coverage",
      radius_m_used: r,
      images: images
    };
    cacheSet(cacheKey, out);
    return out;
  } catch (_e) {
    return {
      ok: false,
      reason: "mapillary_network",
      failure_kind: "network",
      images: []
    };
  }
}

async function fetchMapillaryProgressive(lat, lng, startRadiusM, limit, expand) {
  const start = Math.min(Math.max(Number(startRadiusM) || 50, 5), 1000);
  let steps;
  if (expand) {
    const ladder = [50, 100, 250, 500, 1000];
    steps = [start].concat(
      ladder.filter(function (n) {
        return n > start;
      })
    );
  } else {
    steps = [start];
  }
  let last = {
    ok: false,
    images: [],
    reason: "mapillary_no_coverage_nearby",
    failure_kind: "no_coverage"
  };
  for (let i = 0; i < steps.length; i++) {
    last = await fetchMapillaryNearby(lat, lng, steps[i], limit);
    if (last.ok && last.images && last.images.length) {
      return Object.assign({}, last, {
        radius_m_used: steps[i],
        expanded: steps[i] > start,
        expand_steps_tried: steps.slice(0, i + 1)
      });
    }
    if (last.failure_kind === "missing_key" || last.failure_kind === "api_auth") {
      return Object.assign({}, last, {
        radius_m_used: steps[i],
        expand_steps_tried: steps.slice(0, i + 1)
      });
    }
  }
  return Object.assign({}, last, {
    radius_m_used: steps[steps.length - 1],
    expand_steps_tried: steps
  });
}

function publicUserMessage(kind, detail) {
  if (kind === "ok") return "Street-level 360° imagery is available near this place.";
  if (kind === "missing_key") {
    return "360° street imagery is not configured for HAVKAR yet. Satellite and licensed photos may still help.";
  }
  if (kind === "api_auth") {
    return "Street imagery provider rejected the request. Coverage cannot be shown right now.";
  }
  if (kind === "api_error" || kind === "network") {
    return "Street imagery service is temporarily unavailable. Try again shortly or use satellite view.";
  }
  if (kind === "no_coverage") {
    return (
      detail ||
      "No street-level 360° imagery was found near these coordinates. You can widen the search radius or use satellite view."
    );
  }
  return "Street-level 360° is unavailable for this location.";
}

async function fetchMapillarySequence(sequenceId, aroundImageId) {
  const token = mapillaryToken();
  if (!token || !sequenceId) return [];
  const fields = "id,geometry,computed_geometry,captured_at,compass_angle,is_pano,thumb_1024_url,thumb_2048_url,sequence";
  const url =
    "https://graph.mapillary.com/image_ids?access_token=" +
    encodeURIComponent(token) +
    "&sequence_id=" +
    encodeURIComponent(sequenceId);
  /* Fallback: images?sequence_ids= */
  const url2 =
    "https://graph.mapillary.com/images?access_token=" +
    encodeURIComponent(token) +
    "&sequence_ids=" +
    encodeURIComponent(sequenceId) +
    "&fields=" +
    encodeURIComponent(fields) +
    "&limit=100";
  try {
    const res = await fetch(url2, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return [];
    const body = await res.json();
    const rows = body && Array.isArray(body.data) ? body.data : [];
    const mapped = rows
      .map(function (img) {
        const geom =
          (img.computed_geometry && img.computed_geometry.coordinates) ||
          (img.geometry && img.geometry.coordinates) ||
          null;
        if (!geom) return null;
        return {
          id: String(img.id),
          latitude: Number(geom[1]),
          longitude: Number(geom[0]),
          captured_at: img.captured_at || null,
          is_pano: img.is_pano === true,
          thumb_url: img.thumb_2048_url || img.thumb_1024_url || null,
          sequence_id: sequenceId,
          source_url: "https://www.mapillary.com/app/?pKey=" + encodeURIComponent(String(img.id))
        };
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return Number(a.captured_at || 0) - Number(b.captured_at || 0);
      });
    if (aroundImageId) {
      const idx = mapped.findIndex(function (i) {
        return i.id === String(aroundImageId);
      });
      if (idx >= 0) {
        const start = Math.max(0, idx - 20);
        return mapped.slice(start, start + 50);
      }
    }
    return mapped.slice(0, 50);
  } catch (_e) {
    return [];
  }
}

function buildGoogleEmbed(lat, lng) {
  const key = googleEmbedKey();
  if (!key) return null;
  const src =
    "https://www.google.com/maps/embed/v1/streetview?key=" +
    encodeURIComponent(key) +
    "&location=" +
    encodeURIComponent(lat + "," + lng) +
    "&fov=80";
  return {
    provider: "google_maps_embed_streetview",
    interactive_360: true,
    rotate: true,
    move_between_points: true,
    embed_url: src,
    attribution: "Google Street View",
    license: "Google Maps Platform / Embed API",
    note:
      "Google Embed Street View usage is free. Key must be referrer-restricted. Nearest Google coverage is used when available; empty Google coverage shows Google empty state inside the iframe."
  };
}

function fallbacks() {
  return [
    {
      id: "satellite",
      label: "Static satellite imagery (Esri World Imagery)",
      available: true,
      live: false
    },
    {
      id: "hybrid",
      label: "Hybrid map (satellite + labels)",
      available: true,
      live: false
    },
    {
      id: "wikimedia_photos",
      label: "Licensed Wikimedia Commons photos near the place (when coverage exists)",
      available: true,
      live: false
    }
  ];
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const q = req.query || {};
  const providers = providerStatus();
  const secrets = requiredSecrets();
  const loc = parseLatLng(q);
  const prefer = String(q.provider || "auto").toLowerCase();
  const expand =
    String(q.expand || "") === "1" ||
    String(q.expand || "").toLowerCase() === "true" ||
    String(q.expand || "").toLowerCase() === "auto";
  const radiusM = Math.min(Math.max(Number(q.radius_m || q.radius || 50) || 50, 5), 1000);
  const imageId = String(q.image_id || q.imageId || "").trim();
  const sequenceId = String(q.sequence_id || "").trim();
  const includeSecrets = String(q.debug || "") === "1";

  /* Sequence neighbor expansion for Mapillary move-between-points */
  if (sequenceId && mapillaryToken()) {
    const seqImages = await fetchMapillarySequence(sequenceId, imageId || null);
    return send(res, 200, {
      ok: true,
      available: seqImages.length > 0,
      armed: true,
      interactive_360: seqImages.length > 0,
      provider: "mapillary",
      free_for_users: true,
      sequence_id: sequenceId,
      images: seqImages,
      client_token: mapillaryToken(),
      viewer: {
        type: "mapillary_js",
        cdn_js: "https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.js",
        cdn_css: "https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.css",
        initial_image_id: imageId || (seqImages[0] && seqImages[0].id) || null,
        sequence_navigation: true
      },
      fetched_at: new Date().toISOString()
    });
  }

  if (!loc) {
    const anyConfigured = providers.some(function (p) {
      return p.configured;
    });
    return send(res, 200, {
      ok: true,
      available: false,
      armed: anyConfigured,
      interactive_360: false,
      free_for_users: true,
      reason: anyConfigured
        ? "Provider key is configured. Pass lat & lng for the hotel coordinates to load real nearby coverage."
        : "No Mapillary Client Token or Google Maps Embed API key is configured.",
      providers: providers,
      required_secrets: secrets,
      fallbacks: fallbacks(),
      honesty:
        "HAVKAR never invents 360 street panoramas. Mapillary is free (Client Token). Google Embed Street View usage is $0 but needs a Google Cloud billing account to mint the key.",
      fetched_at: new Date().toISOString()
    });
  }

  let mapillary = { ok: false, images: [], reason: "skipped", failure_kind: "no_coverage" };
  let google = null;

  if (prefer === "auto" || prefer === "mapillary") {
    mapillary = await fetchMapillaryProgressive(
      loc.lat,
      loc.lng,
      radiusM,
      Number(q.limit || 12),
      expand || radiusM <= 50
    );
  }
  if (
    (prefer === "auto" || prefer === "google" || prefer === "google_maps_embed_streetview") &&
    googleEmbedKey()
  ) {
    google = buildGoogleEmbed(loc.lat, loc.lng);
  }

  const hasMly = mapillary.ok && mapillary.images && mapillary.images.length > 0;
  const useMly = hasMly && prefer !== "google" && prefer !== "google_maps_embed_streetview";
  const useGoogle = !useMly && google;
  const usedRadius = mapillary.radius_m_used || radiusM;

  if (useMly) {
    const initial = mapillary.images[0];
    return send(res, 200, {
      ok: true,
      available: true,
      armed: true,
      interactive_360: true,
      free_for_users: true,
      failure_kind: "ok",
      user_message: publicUserMessage("ok"),
      provider: "mapillary",
      center: { latitude: loc.lat, longitude: loc.lng },
      radius_m: usedRadius,
      radius_m_requested: radiusM,
      expanded: Boolean(mapillary.expanded),
      expand_steps_tried: mapillary.expand_steps_tried || [usedRadius],
      distance_m: initial.distance_m,
      rotate: true,
      move_between_points: true,
      images: mapillary.images,
      initial_image_id: initial.id,
      client_token: mapillaryToken(),
      viewer: {
        type: "mapillary_js",
        cdn_js: "https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.js",
        cdn_css: "https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.css",
        initial_image_id: initial.id,
        sequence_navigation: true
      },
      official_open_url: initial.source_url,
      attribution: "© Mapillary contributors",
      license: "Mapillary Terms · User Content CC BY-SA",
      providers: providers,
      required_secrets: includeSecrets ? secrets : undefined,
      fallbacks: fallbacks(),
      google_embed_available: Boolean(google),
      honesty:
        "Real Mapillary coverage near the hotel coordinates. Distance shown is meters from the stay. Rotate in-viewer; move along the capture sequence when edges exist. No fabricated panoramas.",
      fetched_at: new Date().toISOString()
    });
  }

  if (useGoogle) {
    return send(res, 200, {
      ok: true,
      available: true,
      armed: true,
      interactive_360: true,
      free_for_users: true,
      failure_kind: "ok",
      user_message: publicUserMessage("ok"),
      provider: "google_maps_embed_streetview",
      center: { latitude: loc.lat, longitude: loc.lng },
      radius_m: radiusM,
      rotate: true,
      move_between_points: true,
      embed_url: google.embed_url,
      viewer: {
        type: "google_embed_iframe",
        embed_url: google.embed_url
      },
      attribution: google.attribution,
      license: google.license,
      providers: providers,
      required_secrets: includeSecrets ? secrets : undefined,
      fallbacks: fallbacks(),
      mapillary_attempted: prefer !== "google",
      mapillary_reason: mapillary.reason || null,
      honesty:
        "Google Maps Embed Street View near the hotel coordinates (free usage). Coverage depends on Google imagery — empty means no Google coverage, not a fake scene.",
      fetched_at: new Date().toISOString()
    });
  }

  const tokenMissing = !mapillaryToken() && !googleEmbedKey();
  const failureKind = tokenMissing
    ? "missing_key"
    : mapillary.failure_kind ||
      (mapillary.reason === "mapillary_no_coverage_nearby" ? "no_coverage" : "api_error");
  const userMessage = publicUserMessage(
    failureKind,
    failureKind === "no_coverage"
      ? "No street-level 360° imagery within " +
          usedRadius +
          " m of these coordinates. Widen the search or use satellite view."
      : null
  );
  return send(res, 200, {
    ok: true,
    available: false,
    armed: Boolean(mapillaryToken() || googleEmbedKey()),
    interactive_360: false,
    free_for_users: true,
    failure_kind: failureKind,
    user_message: userMessage,
    center: { latitude: loc.lat, longitude: loc.lng },
    radius_m: usedRadius,
    radius_m_requested: radiusM,
    expand_steps_tried: mapillary.expand_steps_tried || [usedRadius],
    reason: userMessage,
    mapillary_error: includeSecrets ? mapillary.error_message || null : null,
    providers: providers,
    required_secrets: includeSecrets ? secrets : undefined,
    fallbacks: fallbacks(),
    honesty:
      "HAVKAR never invents 360 street panoramas. When coverage or configuration is missing, satellite / hybrid / nearby licensed photos are offered instead.",
    fetched_at: new Date().toISOString()
  });
}
