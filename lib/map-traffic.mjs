/**
 * Live traffic flow layer status + optional tile proxy.
 * TOMTOM_API_KEY stays server-side — never returned to the browser.
 */

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function getKey() {
  return String(process.env.TOMTOM_API_KEY || "").trim();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const key = getKey();
  const z = req.query && req.query.z;
  const x = req.query && req.query.x;
  const y = req.query && req.query.y;

  /* Tile proxy mode — only when Owner key is configured. */
  if (z != null && x != null && y != null) {
    if (!key) {
      return res.status(503).json({ ok: false, error: "traffic_not_configured" });
    }
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
      return res.status(400).json({ ok: false, error: "invalid_tile" });
    }
    const url =
      "https://api.tomtom.com/traffic/map/4/tile/flow/" +
      zi +
      "/" +
      xi +
      "/" +
      yi +
      ".png?key=" +
      encodeURIComponent(key) +
      "&thickness=8";
    try {
      const upstream = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!upstream.ok) {
        return res.status(502).json({ ok: false, error: "traffic_tile_upstream" });
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.status(200).send(buf);
    } catch (_e) {
      return res.status(502).json({ ok: false, error: "traffic_tile_network" });
    }
  }

  if (!key) {
    return send(res, 200, {
      ok: true,
      available: false,
      enabled: false,
      source: "TomTom Traffic Flow (not configured)",
      message:
        "Live traffic flow is not enabled. Owner must approve and configure TOMTOM_API_KEY. No simulated traffic is shown.",
      requires_owner_secret: "TOMTOM_API_KEY",
      commercial_note:
        "TomTom free monthly quotas exist but require an account key; paid volume needs Owner approval."
    });
  }

  return send(res, 200, {
    ok: true,
    available: true,
    enabled: true,
    source: "TomTom Traffic Flow",
    source_url: "https://developer.tomtom.com/",
    attribution: "Traffic © TomTom",
    tile_url_template: "/api/map-traffic?z={z}&x={x}&y={y}",
    max_zoom: 22,
    fetched_at: new Date().toISOString(),
    message: "Live traffic flow tiles enabled with Owner-configured TomTom key."
  });
}
