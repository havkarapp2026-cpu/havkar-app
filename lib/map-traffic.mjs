/**
 * Live traffic flow + incident tile status / proxy.
 * Key stays server-side via HAVKAR_TOMTOM_API_KEY (or legacy TOMTOM_API_KEY) —
 * never returned to the browser.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getTomTomApiKey, tomtomConfigured } = require("./tomtom-key.cjs");

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function parseTile(query) {
  const z = query && query.z;
  const x = query && query.x;
  const y = query && query.y;
  if (z == null || x == null || y == null) return null;
  const zi = Number(z);
  const xi = Number(x);
  const yi = Number(y);
  if (
    !Number.isInteger(zi) ||
    !Number.isInteger(xi) ||
    !Number.isInteger(yi) ||
    zi < 0 ||
    zi > 22 ||
    xi < 0 ||
    yi < 0
  ) {
    return { error: "invalid_tile" };
  }
  return { z: zi, x: xi, y: yi };
}

async function proxyTile(res, key, kind, tile) {
  const layer = kind === "incidents" ? "incidents" : "flow";
  const url =
    "https://api.tomtom.com/traffic/map/4/tile/" +
    layer +
    "/" +
    tile.z +
    "/" +
    tile.x +
    "/" +
    tile.y +
    ".png?key=" +
    encodeURIComponent(key) +
    (layer === "flow" ? "&thickness=8" : "");
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!upstream.ok) {
      return res.status(502).json({
        ok: false,
        error: "traffic_tile_upstream",
        http_status: upstream.status,
        layer
      });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).send(buf);
  } catch (_e) {
    return res.status(502).json({ ok: false, error: "traffic_tile_network", layer });
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const { key, source } = getTomTomApiKey();
  const cfg = tomtomConfigured();
  const tile = parseTile(req.query || {});
  const kind = String((req.query && req.query.kind) || "flow").toLowerCase();

  if (tile && tile.error) {
    return res.status(400).json({ ok: false, error: tile.error });
  }

  /* Tile proxy mode — only when Owner key is configured. */
  if (tile) {
    if (!key) {
      return res.status(503).json({ ok: false, error: "traffic_not_configured" });
    }
    return proxyTile(res, key, kind, tile);
  }

  if (!key) {
    return send(res, 200, {
      ok: true,
      available: false,
      enabled: false,
      source: "TomTom Traffic Flow (not configured)",
      message:
        "Live traffic flow is not enabled. Owner must configure HAVKAR_TOMTOM_API_KEY in Vercel. No simulated traffic is shown.",
      requires_owner_secret: "HAVKAR_TOMTOM_API_KEY",
      commercial_note: cfg.commercial_note
    });
  }

  const fetchedAt = new Date().toISOString();
  return send(res, 200, {
    ok: true,
    available: true,
    enabled: true,
    source: "TomTom Traffic Flow + Incidents",
    source_url: "https://developer.tomtom.com/traffic-api/documentation/product-information/introduction",
    attribution: "Traffic © TomTom",
    tile_url_template: "/api/map-traffic?kind=flow&z={z}&x={x}&y={y}",
    incidents_tile_url_template: "/api/map-traffic?kind=incidents&z={z}&x={x}&y={y}",
    max_zoom: 22,
    fetched_at: fetchedAt,
    last_updated: fetchedAt,
    key_env: source,
    evaluation_note:
      "Using Owner TomTom Free/Evaluation quotas only. No paid TomTom plan is armed by HAVKAR.",
    commercial_note: cfg.commercial_note,
    features: {
      flow: true,
      congestion_colors: true,
      incidents: true,
      accidents_and_closures: "via_incident_tiles_when_tomtom_publishes"
    },
    message:
      "Live TomTom traffic flow + incident tiles enabled · last update " +
      fetchedAt +
      " · key server-side only"
  });
}
