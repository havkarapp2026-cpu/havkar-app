/*
 * Server-side crypto geographic policy for HAVKAR.
 *
 * Default: ENFORCEMENT OFF (no Production restriction until Owner sets
 * HAVKAR_CRYPTO_GEO_ENFORCEMENT=true after legal review).
 *
 * When enforcement is ON, XLM quote/settlement is refused for restricted
 * countries. Non-crypto product surfaces stay available.
 *
 * Client-supplied country codes are NOT trusted for bypass unless the Owner
 * explicitly sets HAVKAR_CRYPTO_GEO_TRUST_CLIENT_HEADER=true (discouraged).
 * Prefer platform geo headers (Vercel / Cloudflare). Missing/uncertain
 * location fails closed for crypto when enforcement is on (default).
 *
 * This module is not legal advice and does not grant MiCA/CASP status.
 */

const EU_MEMBER_ISO2 = Object.freeze([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE"
]);

/** Play EU list today + EEA states Play adds from July 2026. */
const EU_EEA_ISO2 = Object.freeze(EU_MEMBER_ISO2.concat(["IS", "LI", "NO"]));

/**
 * Countries/regions Google Play lists with crypto exchange/wallet forms
 * (see Play Console Help answer 16329703). Not a complete world map.
 */
const PLAY_CRYPTO_FORM_ISO2 = Object.freeze(
  EU_EEA_ISO2.concat([
    "BH",
    "CA",
    "HK",
    "ID",
    "IL",
    "JP",
    "PH",
    "ZA",
    "KR",
    "TH",
    "AE",
    "GB",
    "US"
  ])
);

const ENFORCEMENT_FLAG = "HAVKAR_CRYPTO_GEO_ENFORCEMENT";
const PRESET_FLAG = "HAVKAR_CRYPTO_GEO_PRESET";
const MODE_FLAG = "HAVKAR_CRYPTO_GEO_MODE";
const RESTRICTED_FLAG = "HAVKAR_CRYPTO_RESTRICTED_COUNTRIES";
const ALLOWED_FLAG = "HAVKAR_CRYPTO_ALLOWED_COUNTRIES";
const UNCERTAIN_FLAG = "HAVKAR_CRYPTO_GEO_UNCERTAIN";
const TRUST_CLIENT_FLAG = "HAVKAR_CRYPTO_GEO_TRUST_CLIENT_HEADER";

function normalizeCountry(value) {
  const raw = String(value || "")
    .trim()
    .toUpperCase();

  if (!raw || raw === "XX" || raw === "T1" || raw === "ZZ" || raw === "UNKNOWN") {
    return null;
  }

  if (!/^[A-Z]{2}$/.test(raw)) {
    return null;
  }

  return raw;
}

function parseCountryList(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map(normalizeCountry)
    .filter(Boolean);
}

function uniqueCountries(list) {
  return Array.from(new Set(list));
}

function cryptoGeoEnforcementEnabled(env = process.env) {
  return env?.[ENFORCEMENT_FLAG] === "true";
}

function trustClientCountryHeader(env = process.env) {
  return env?.[TRUST_CLIENT_FLAG] === "true";
}

function uncertainCryptoPolicy(env = process.env) {
  return String(env?.[UNCERTAIN_FLAG] || "deny").toLowerCase() === "allow"
    ? "allow"
    : "deny";
}

function geoMode(env = process.env) {
  const mode = String(env?.[MODE_FLAG] || "deny_list").toLowerCase();
  return mode === "allow_list" ? "allow_list" : "deny_list";
}

function presetCountries(env = process.env) {
  const preset = String(env?.[PRESET_FLAG] || "eu_eea").toLowerCase();

  if (preset === "play_listed") {
    return PLAY_CRYPTO_FORM_ISO2.slice();
  }

  if (preset === "eu" || preset === "eu_members") {
    return EU_MEMBER_ISO2.slice();
  }

  if (preset === "custom" || preset === "none") {
    return [];
  }

  return EU_EEA_ISO2.slice();
}

function restrictedCountries(env = process.env) {
  const custom = parseCountryList(env?.[RESTRICTED_FLAG]);

  if (custom.length) {
    return uniqueCountries(custom);
  }

  return uniqueCountries(presetCountries(env));
}

function allowedCountries(env = process.env) {
  return uniqueCountries(parseCountryList(env?.[ALLOWED_FLAG]));
}

/**
 * Resolve country from request-like headers. Does not invent IP geolocation.
 */
function resolveRequestCountry(req, env = process.env) {
  const headers = (req && req.headers) || {};
  const lower = {};

  Object.keys(headers).forEach(function (key) {
    lower[String(key).toLowerCase()] = headers[key];
  });

  const platform =
    normalizeCountry(lower["x-vercel-ip-country"]) ||
    normalizeCountry(lower["cf-ipcountry"]) ||
    normalizeCountry(lower["cloudfront-viewer-country"]);

  if (platform) {
    return {
      country: platform,
      source: "platform",
      uncertain: false
    };
  }

  if (trustClientCountryHeader(env)) {
    const client =
      normalizeCountry(lower["x-havkar-country"]) ||
      normalizeCountry(req && req.body && req.body.country_code);

    if (client) {
      return {
        country: client,
        source: "client_trusted",
        uncertain: true
      };
    }
  }

  return {
    country: null,
    source: "none",
    uncertain: true
  };
}

function evaluateCryptoGeoAccess(input, env = process.env) {
  const enforcement = cryptoGeoEnforcementEnabled(env);
  const mode = geoMode(env);
  const country = normalizeCountry(input && input.country);
  const uncertain = Boolean(
    (input && input.uncertain) || !country
  );

  if (!enforcement) {
    return {
      allowed: true,
      enforcement: false,
      mode: mode,
      country: country,
      uncertain: uncertain,
      code: null,
      error: null
    };
  }

  if (uncertain || !country) {
    if (uncertainCryptoPolicy(env) === "allow") {
      return {
        allowed: true,
        enforcement: true,
        mode: mode,
        country: country,
        uncertain: true,
        code: "CRYPTO_GEO_UNCERTAIN_ALLOWED",
        error: null
      };
    }

    return {
      allowed: false,
      enforcement: true,
      mode: mode,
      country: country,
      uncertain: true,
      status: 403,
      code: "CRYPTO_GEO_UNCERTAIN",
      error:
        "Crypto checkout is restricted while location cannot be verified. Non-crypto HAVKAR features remain available. VPN/proxy may cause this result."
    };
  }

  if (mode === "allow_list") {
    const allow = allowedCountries(env);

    if (!allow.length) {
      return {
        allowed: false,
        enforcement: true,
        mode: mode,
        country: country,
        uncertain: false,
        status: 503,
        code: "CRYPTO_GEO_ALLOWLIST_EMPTY",
        error:
          "Crypto geo allow-list enforcement is on but HAVKAR_CRYPTO_ALLOWED_COUNTRIES is empty."
      };
    }

    if (allow.indexOf(country) === -1) {
      return {
        allowed: false,
        enforcement: true,
        mode: mode,
        country: country,
        uncertain: false,
        status: 403,
        code: "CRYPTO_GEO_RESTRICTED",
        error:
          "XLM crypto checkout is not available in this country under the current HAVKAR geo policy. Other features remain available."
      };
    }

    return {
      allowed: true,
      enforcement: true,
      mode: mode,
      country: country,
      uncertain: false,
      code: null,
      error: null
    };
  }

  const denied = restrictedCountries(env);

  if (denied.indexOf(country) !== -1) {
    return {
      allowed: false,
      enforcement: true,
      mode: mode,
      country: country,
      uncertain: false,
      status: 403,
      code: "CRYPTO_GEO_RESTRICTED",
      error:
        "XLM crypto checkout is geo-restricted for this country. Non-crypto HAVKAR features remain available."
    };
  }

  return {
    allowed: true,
    enforcement: true,
    mode: mode,
    country: country,
    uncertain: false,
    code: null,
    error: null
  };
}

function describeCryptoGeoStatus(env = process.env) {
  return {
    enforcement: cryptoGeoEnforcementEnabled(env),
    mode: geoMode(env),
    preset: String(env?.[PRESET_FLAG] || "eu_eea"),
    restricted_count: restrictedCountries(env).length,
    allowed_count: allowedCountries(env).length,
    uncertain_policy: uncertainCryptoPolicy(env),
    trust_client_header: trustClientCountryHeader(env),
    note:
      "Default enforcement is off. Owner legal review required before enabling Production restrictions. Geoblocking alone is not claimed as legal sufficiency."
  };
}

module.exports = {
  EU_MEMBER_ISO2,
  EU_EEA_ISO2,
  PLAY_CRYPTO_FORM_ISO2,
  ENFORCEMENT_FLAG,
  normalizeCountry,
  cryptoGeoEnforcementEnabled,
  resolveRequestCountry,
  evaluateCryptoGeoAccess,
  describeCryptoGeoStatus,
  restrictedCountries,
  allowedCountries
};
