/**
 * Street View / 360 coverage gate.
 * Google Street View and Mapillary need Owner keys + commercial terms.
 * Never fabricates panoramas. Returns honest availability only.
 */

function send(res, status, body) {
  res.setHeader("Cache-Control", "public, max-age=120");
  return res.status(status).json(body);
}

function readKey(name) {
  return String(process.env[name] || "").trim();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const googleKey = readKey("GOOGLE_MAPS_API_KEY") || readKey("HAVKAR_GOOGLE_MAPS_API_KEY");
  const mapillary = readKey("MAPILLARY_ACCESS_TOKEN") || readKey("HAVKAR_MAPILLARY_ACCESS_TOKEN");

  const providers = [
    {
      id: "google_street_view",
      display_name: "Google Street View",
      configured: Boolean(googleKey),
      interactive_360: false,
      signup_url: "https://developers.google.com/maps/documentation/streetview",
      commercial_note:
        "Requires Google Maps Platform billing account, Street View Static / Maps JS APIs, and domain restrictions. Not armed without Owner authorization."
    },
    {
      id: "mapillary",
      display_name: "Mapillary",
      configured: Boolean(mapillary),
      interactive_360: false,
      signup_url: "https://www.mapillary.com/developer",
      commercial_note:
        "Requires Mapillary access token and compliance with Mapillary terms. Not armed without Owner authorization."
    }
  ];

  const available = providers.some(function (p) {
    return p.configured;
  });

  return send(res, 200, {
    ok: true,
    available: false,
    armed: false,
    interactive_360: false,
    free_for_users: true,
    reason: available
      ? "A Street View provider key exists but HAVKAR interactive 360 is not armed until Owner enables commercial use."
      : "No Google Street View or Mapillary API key is configured in this environment.",
    providers: providers,
    fallbacks: [
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
    ],
    honesty:
      "HAVKAR never invents 360 street panoramas. When coverage or keys are missing, satellite / hybrid / nearby licensed photos are offered instead.",
    fetched_at: new Date().toISOString()
  });
}
