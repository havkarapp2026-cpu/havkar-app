/**
 * RainViewer public Weather Maps API — precipitation radar frames.
 * Attribution required. Free tier: personal/educational/small-scale community.
 * Does not invent frames; returns upstream metadata only.
 */

const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";
const TIMEOUT_MS = 10000;

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function formatUtc(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "";
  try {
    return new Date(n * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  } catch (_e) {
    return String(n);
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const response = await fetch(RAINVIEWER_API, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!response.ok) {
      return send(res, 502, {
        ok: false,
        available: false,
        error: "rain_radar_upstream",
        message: "Rain radar is not available right now."
      });
    }
    const body = await response.json();
    const past =
      body && body.radar && Array.isArray(body.radar.past) ? body.radar.past : [];
    if (!past.length || !body.host) {
      return send(res, 200, {
        ok: true,
        available: false,
        message: "Rain radar has no frames for this period.",
        source: "RainViewer",
        source_url: "https://www.rainviewer.com/",
        terms:
          "Public Weather Maps API — personal/educational/small-scale community use; attribution required."
      });
    }

    const host = String(body.host).replace(/\/$/, "");
    const frames = past.map(function (frame) {
      return {
        time: frame.time,
        time_utc: formatUtc(frame.time),
        path: frame.path,
        tile_url: host + String(frame.path) + "/256/{z}/{x}/{y}/2/1_1.png"
      };
    });
    const latest = frames[frames.length - 1];

    return send(res, 200, {
      ok: true,
      available: true,
      source: "RainViewer",
      source_url: "https://www.rainviewer.com/",
      product: "Precipitation radar (composite reflectivity)",
      attribution: "Weather data by RainViewer",
      coverage:
        "Worldwide where meteorological agencies publish radar via RainViewer. Empty areas mean no rain radar there.",
      terms:
        "Public Weather Maps API — personal/educational/small-scale community use; mandatory attribution. Max zoom 7 on free tier.",
      commercial_note:
        "Heavy commercial production use may require a separate RainViewer agreement. Owner approval required before paid plans.",
      generated: body.generated,
      generated_utc: formatUtc(body.generated),
      max_zoom: 7,
      legend: [
        { color: "#00000000", label: "No rain / no coverage" },
        { color: "#00e5ff", label: "Light" },
        { color: "#2979ff", label: "Moderate" },
        { color: "#aa00ff", label: "Heavy" },
        { color: "#ff1744", label: "Very heavy" }
      ],
      frames: frames,
      latest: latest,
      coverage_url: host + "/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png"
    });
  } catch (_e) {
    return send(res, 502, {
      ok: false,
      available: false,
      error: "rain_radar_network",
      message: "Rain radar is not available right now (network error)."
    });
  }
}
