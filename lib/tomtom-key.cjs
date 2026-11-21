/**
 * Server-side TomTom API key resolver.
 * Prefer Owner-registered HAVKAR_TOMTOM_API_KEY; accept legacy TOMTOM_API_KEY.
 * Never return the raw key to browsers or logs.
 */

function getTomTomApiKey(env = process.env) {
  const primary = String(env.HAVKAR_TOMTOM_API_KEY || "").trim();
  if (primary) {
    return { key: primary, source: "HAVKAR_TOMTOM_API_KEY" };
  }
  const legacy = String(env.TOMTOM_API_KEY || "").trim();
  if (legacy) {
    return { key: legacy, source: "TOMTOM_API_KEY" };
  }
  return { key: "", source: "" };
}

function tomtomConfigured(env = process.env) {
  const resolved = getTomTomApiKey(env);
  return {
    configured: Boolean(resolved.key),
    env_name: resolved.source || "HAVKAR_TOMTOM_API_KEY",
    commercial_note:
      "TomTom Free/Evaluation monthly quotas (no paid plan armed by HAVKAR): Search/Geocoding and Routing free tiers, Traffic Flow raster tiles, Traffic Incidents free tier. Exceeding free quota or enabling paid volume requires Owner approval. Key stays server-side."
  };
}

module.exports = {
  getTomTomApiKey,
  tomtomConfigured
};
