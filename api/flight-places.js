import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const DUFFEL_API = "https://api.duffel.com";
const DUFFEL_VERSION = "v2";
const TRANSLATE_URL =
  "https://translation.googleapis.com/v3/projects/" +
  (process.env.GOOGLE_TRANSLATION_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT_ID ||
    "havkar-d6c40") +
  ":translateText";

function bearerToken(req) {
  const header = req.headers?.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  const authorization = typeof value === "string" ? value : "";
  if (!authorization.startsWith("Bearer ")) {
    return "";
  }
  return authorization.slice(7).trim();
}

async function requireHavkarUser(req) {
  const accessToken = bearerToken(req);
  if (!accessToken) {
    return { user: null, status: 401, error: "Authentication required" };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { user: null, status: 500, error: "Server configuration error" };
  }
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) {
    return { user: null, status: 401, error: "Invalid or expired session" };
  }
  return { user: data.user, status: null, error: null };
}

function normalizePrivateKey(value) {
  if (!value) return "";
  let key = String(value).trim().replace(/\\n/g, "\n");
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).replace(/\\n/g, "\n");
  }
  return key;
}

function googleLanguageCode(language) {
  const code = String(language || "").trim().toLowerCase();
  if (code === "ku" || code === "kmr") return "ku";
  if (code === "ckb") return "ckb";
  return code || "en";
}

function needsEnglishBridge(query, language) {
  const lang = googleLanguageCode(language);
  if (/^[A-Za-z]{3}$/.test(query.trim())) return false;
  if (lang && lang !== "en") return true;
  // Non-ASCII city/country names (e.g. Persian, Arabic, Chinese)
  return /[^\u0000-\u007f]/.test(query);
}

async function translateViaGoogle(texts, sourceLanguage, targetLanguage) {
  const clientEmail = process.env.GOOGLE_TRANSLATION_CLIENT_EMAIL || "";
  const privateKey = normalizePrivateKey(
    process.env.GOOGLE_TRANSLATION_PRIVATE_KEY || ""
  );
  if (!clientEmail || !privateKey || !texts.length) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  ).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/cloud-translation",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    })
  ).toString("base64url");
  const unsigned = `${header}.${claim}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(privateKey, "base64url");
  const jwt = `${unsigned}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    }).toString()
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson.access_token) {
    return null;
  }

  const payload = {
    contents: texts,
    targetLanguageCode: googleLanguageCode(targetLanguage),
    mimeType: "text/plain"
  };
  if (sourceLanguage && sourceLanguage !== "auto") {
    payload.sourceLanguageCode = googleLanguageCode(sourceLanguage);
  }

  const response = await fetch(TRANSLATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return null;
  }
  const translations = Array.isArray(data?.translations)
    ? data.translations.map((row) => String(row?.translatedText || "").trim())
    : [];
  return translations.length === texts.length ? translations : null;
}

export function normalizePlace(place) {
  if (!place || typeof place !== "object") {
    return null;
  }
  const type = String(place.type || "").toLowerCase();
  const iata = String(place.iata_code || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iata)) {
    return null;
  }
  const cityName =
    place.city_name ||
    place.city?.name ||
    (type === "city" ? place.name : null) ||
    "";
  const countryCode = String(place.iata_country_code || "").trim().toUpperCase();
  const countryName = String(place.country_name || "").trim();
  const name = String(place.name || "").trim();
  const labelParts = [];
  if (name) labelParts.push(name);
  if (cityName && cityName !== name) labelParts.push(cityName);
  if (countryName) labelParts.push(countryName);
  else if (countryCode) labelParts.push(countryCode);
  labelParts.push(iata);

  const airports = Array.isArray(place.airports)
    ? place.airports
        .map((airport) => normalizePlace({ ...airport, type: "airport" }))
        .filter(Boolean)
    : [];

  return {
    id: place.id || `${type}_${iata}`,
    type: type === "city" ? "city" : "airport",
    name: name || cityName || iata,
    city_name: cityName || null,
    country_code: countryCode || null,
    country_name: countryName || null,
    iata_code: iata,
    iata_city_code: place.iata_city_code
      ? String(place.iata_city_code).toUpperCase()
      : null,
    label: labelParts.join(" · "),
    airports
  };
}

export function expandSuggestions(places) {
  const out = [];
  const seen = new Set();
  for (const place of places) {
    const normalized = normalizePlace(place);
    if (!normalized) continue;
    const key = `${normalized.type}:${normalized.iata_code}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(normalized);
    }
    for (const airport of normalized.airports || []) {
      const airportKey = `airport:${airport.iata_code}`;
      if (!seen.has(airportKey)) {
        seen.add(airportKey);
        out.push(airport);
      }
    }
  }
  return out.slice(0, 12);
}

async function fetchDuffelPlaces(token, query) {
  const url = new URL(`${DUFFEL_API}/places/suggestions`);
  url.searchParams.set("name", query);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Duffel-Version": DUFFEL_VERSION,
      "Accept-Encoding": "gzip"
    }
  });

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  return { response, payload };
}

async function localizeSuggestionLabels(suggestions, language) {
  const lang = googleLanguageCode(language);
  if (!lang || lang === "en" || !suggestions.length) {
    return suggestions;
  }
  const sources = suggestions.map((row) => {
    const parts = [row.name];
    if (row.city_name && row.city_name !== row.name) parts.push(row.city_name);
    if (row.country_name) parts.push(row.country_name);
    return parts.join(", ");
  });
  const translated = await translateViaGoogle(sources, "en", lang);
  if (!translated) return suggestions;
  return suggestions.map((row, index) => {
    const localized = translated[index];
    if (!localized) return row;
    return {
      ...row,
      label: `${localized} · ${row.iata_code}`,
      localized_label: localized
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireHavkarUser(req);
  if (!auth.user) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) {
    return res.status(500).json({
      ok: false,
      error: "DUFFEL_ACCESS_TOKEN is not configured."
    });
  }

  const body =
    req.method === "POST" && req.body && typeof req.body === "object"
      ? req.body
      : {};
  const query = String(
    (req.query && (req.query.q || req.query.query || req.query.name)) ||
      body.q ||
      body.query ||
      body.name ||
      ""
  ).trim();
  const language = String(
    (req.query && (req.query.lang || req.query.language)) ||
      body.lang ||
      body.language ||
      "en"
  ).trim();

  if (query.length < 2) {
    return res.status(200).json({
      ok: true,
      query,
      suggestions: [],
      message: "Type at least 2 characters to search airports and cities."
    });
  }

  if (query.length > 80) {
    return res.status(400).json({
      ok: false,
      error: "Search query is too long."
    });
  }

  try {
    const searchQueries = [query];
    let bridgedQuery = null;
    if (needsEnglishBridge(query, language)) {
      const bridged = await translateViaGoogle([query], "auto", "en");
      bridgedQuery = bridged && bridged[0] ? bridged[0] : null;
      if (
        bridgedQuery &&
        bridgedQuery.toLowerCase() !== query.toLowerCase() &&
        bridgedQuery.length >= 2
      ) {
        searchQueries.push(bridgedQuery);
      }
    }

    const placeMap = new Map();
    let lastError = null;
    for (const searchQuery of searchQueries) {
      const { response, payload } = await fetchDuffelPlaces(token, searchQuery);
      if (!response.ok) {
        const first = Array.isArray(payload?.errors) ? payload.errors[0] : null;
        lastError =
          first?.message ||
          first?.title ||
          payload?.message ||
          "Airport search failed.";
        continue;
      }
      const places = Array.isArray(payload?.data) ? payload.data : [];
      for (const place of places) {
        const id = place?.id || `${place?.type}_${place?.iata_code}`;
        if (id && !placeMap.has(id)) placeMap.set(id, place);
      }
    }

    if (!placeMap.size && lastError) {
      return res.status(502).json({ ok: false, error: lastError });
    }

    let suggestions = expandSuggestions([...placeMap.values()]);
    suggestions = await localizeSuggestionLabels(suggestions, language);

    return res.status(200).json({
      ok: true,
      query,
      bridged_query: bridgedQuery,
      language: googleLanguageCode(language),
      provider: "duffel_places",
      translation_bridge: Boolean(bridgedQuery),
      suggestions,
      empty: suggestions.length === 0
    });
  } catch (error) {
    console.error("HAVKAR Duffel places search error:", error);
    return res.status(500).json({
      ok: false,
      error: "Unable to search airports right now.",
      offline: true
    });
  }
}
