/**
 * Server-side TomTom cost controls: short TTL cache + per-IP rate limits.
 * Does not invent data. Never logs API keys.
 */

const searchCache = new Map();
const routeCache = new Map();
const buckets = new Map();

const SEARCH_TTL_MS = 10 * 60 * 1000;
const ROUTE_TTL_MS = 2 * 60 * 1000;
const SEARCH_PER_MIN = 30;
const ROUTE_PER_MIN = 20;
const TRAFFIC_STATUS_PER_MIN = 60;

function pruneMap(map, now) {
  for (const [k, v] of map.entries()) {
    if (!v || v.expiresAt <= now) map.delete(k);
  }
}

function cacheGet(map, key) {
  const now = Date.now();
  pruneMap(map, now);
  const hit = map.get(key);
  if (!hit || hit.expiresAt <= now) return null;
  return hit.value;
}

function cacheSet(map, key, value, ttlMs) {
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function clientIp(req) {
  const xf = String((req && req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"])) || "");
  const first = xf.split(",")[0].trim();
  if (first) return first.slice(0, 64);
  return String((req && req.socket && req.socket.remoteAddress) || "unknown").slice(0, 64);
}

function rateLimit(req, bucket, limitPerMin) {
  const ip = clientIp(req);
  const key = bucket + ":" + ip;
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + 60 * 1000 };
    buckets.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > limitPerMin) {
    return {
      ok: false,
      error: "rate_limited",
      retry_after_s: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      message:
        "Temporary map request limit reached to protect TomTom Free/Evaluation quota. Try again shortly."
    };
  }
  return { ok: true };
}

module.exports = {
  SEARCH_TTL_MS,
  ROUTE_TTL_MS,
  SEARCH_PER_MIN,
  ROUTE_PER_MIN,
  TRAFFIC_STATUS_PER_MIN,
  cacheGet,
  cacheSet,
  searchCache,
  routeCache,
  rateLimit
};
