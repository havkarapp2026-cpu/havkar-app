"use strict";

const PRODUCTION_SUPABASE_URL = "https://gispovnciifgikvgpzck.supabase.co";
const STAGING_SUPABASE_URL = "https://keglioewbkgdabsizvys.supabase.co";
const STAGING_WEB_HOST = "staging.havkar.online";

const PRODUCTION_WEB_HOSTS = new Set([
  "havkar-app.vercel.app",
  "testnet.havkar.online",
  "localhost",
  "127.0.0.1"
]);

function headerValue(headers, name) {
  if (!headers || typeof headers !== "object") {
    return "";
  }

  const direct = headers[name] ?? headers[name.toLowerCase()];
  const value = Array.isArray(direct) ? direct[0] : direct;

  return typeof value === "string" ? value : "";
}

function normalizeHostname(value) {
  if (typeof value !== "string") {
    return "";
  }

  let host = value.trim().toLowerCase();

  if (
    !host ||
    host.length > 255 ||
    host.includes(",") ||
    host.includes("/") ||
    host.includes(" ") ||
    host.includes("@")
  ) {
    return "";
  }

  if (host.startsWith("[")) {
    const end = host.indexOf("]");

    if (end < 0) {
      return "";
    }

    host = host.slice(1, end);
  } else {
    const colon = host.lastIndexOf(":");

    if (colon > 0 && /^\d{1,5}$/.test(host.slice(colon + 1))) {
      host = host.slice(0, colon);
    }
  }

  if (!host || host.length > 253) {
    return "";
  }

  if (host !== "localhost" && !/^[a-z0-9.-]+$/.test(host)) {
    return "";
  }

  return host;
}

function requestHostname(req) {
  return normalizeHostname(headerValue(req && req.headers, "host"));
}

function canonicalSupabaseUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  let parsed;

  try {
    parsed = new URL(trimmed);
  } catch {
    return "";
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
    return "";
  }

  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    return "";
  }

  if (parsed.search || parsed.hash) {
    return "";
  }

  const host = parsed.hostname.toLowerCase();

  if (host === "gispovnciifgikvgpzck.supabase.co") {
    return PRODUCTION_SUPABASE_URL;
  }

  if (host === "keglioewbkgdabsizvys.supabase.co") {
    return STAGING_SUPABASE_URL;
  }

  return "";
}

function enforcedSupabaseUrl(req, configuredUrl) {
  const hostname = requestHostname(req);
  const canonical = canonicalSupabaseUrl(configuredUrl);

  if (!hostname) {
    return typeof configuredUrl === "string" ? configuredUrl : "";
  }

  if (PRODUCTION_WEB_HOSTS.has(hostname)) {
    return canonical === PRODUCTION_SUPABASE_URL ? PRODUCTION_SUPABASE_URL : "";
  }

  if (hostname === STAGING_WEB_HOST) {
    return canonical === STAGING_SUPABASE_URL ? STAGING_SUPABASE_URL : "";
  }

  return "";
}

function realPaymentsAllowed(hostname) {
  if (!hostname) {
    return true;
  }

  return PRODUCTION_WEB_HOSTS.has(hostname);
}

module.exports = {
  PRODUCTION_SUPABASE_URL,
  STAGING_SUPABASE_URL,
  STAGING_WEB_HOST,
  PRODUCTION_WEB_HOSTS,
  normalizeHostname,
  requestHostname,
  canonicalSupabaseUrl,
  enforcedSupabaseUrl,
  realPaymentsAllowed
};
