/**
 * HAVKAR Translation API
 * -------------------------------------------------------
 * Server-side translation endpoint for HAVKAR
 * Google Cloud Translation API
 *
 * IMPORTANT:
 * - Never put Google Service Account credentials in frontend code.
 * - Never commit the private key to GitHub.
 * - Credentials must be stored in Vercel Environment Variables.
 *
 * Required Vercel environment variables:
 *
 * GOOGLE_TRANSLATION_PROJECT_ID
 * GOOGLE_TRANSLATION_CLIENT_EMAIL
 * GOOGLE_TRANSLATION_PRIVATE_KEY
 *
 * Example project:
 * havkar-d6c40
 */

const crypto = require("crypto");

/* =========================================================
   CONFIG
========================================================= */

const PROJECT_ID =
  process.env.GOOGLE_TRANSLATION_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT_ID ||
  "havkar-d6c40";

const CLIENT_EMAIL =
  process.env.GOOGLE_TRANSLATION_CLIENT_EMAIL || "";

const PRIVATE_KEY = normalizePrivateKey(
  process.env.GOOGLE_TRANSLATION_PRIVATE_KEY || ""
);

const TOKEN_URL = "https://oauth2.googleapis.com/token";

const TRANSLATE_URL =
  `https://translation.googleapis.com/v3/projects/${encodeURIComponent(
    PROJECT_ID
  )}/locations/global:translateText`;

const LANGUAGES_URL =
  `https://translation.googleapis.com/v3/projects/${encodeURIComponent(
    PROJECT_ID
  )}/locations/global/supportedLanguages`;

const GOOGLE_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";

/* =========================================================
   SMALL MEMORY CACHE
========================================================= */

const translationCache = new Map();

const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const MAX_CACHE_ITEMS = 1000;

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

/* =========================================================
   HELPERS
========================================================= */

function normalizePrivateKey(value) {
  if (!value) return "";

  let key = String(value).trim();

  /*
   * Supports private keys stored in Vercel either with
   * real line breaks or escaped \n characters.
   */
  key = key.replace(/\\n/g, "\n");

  /*
   * Also tolerate a JSON-stringified private key.
   */
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).replace(/\\n/g, "\n");
  }

  return key;
}

function base64url(input) {
  const buffer = Buffer.isBuffer(input)
    ? input
    : Buffer.from(String(input));

  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function jsonBase64url(value) {
  return base64url(
    Buffer.from(JSON.stringify(value), "utf8")
  );
}

function sendJSON(res, status, body) {
  res.statusCode = status;

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.setHeader(
    "Cache-Control",
    "no-store, max-age=0"
  );

  return res.end(JSON.stringify(body));
}

function setCors(req, res) {
  const origin = req.headers.origin || "*";

  res.setHeader(
    "Access-Control-Allow-Origin",
    origin
  );

  res.setHeader(
    "Vary",
    "Origin"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
}

function cleanLanguageCode(value) {
  if (!value) return "";

  return String(value)
    .trim()
    .replace(/_/g, "-");
}

function cleanText(value) {
  if (typeof value !== "string") return "";

  return value.trim();
}

function makeCacheKey(text, source, target) {
  return `${source || "auto"}::${target}::${text}`;
}

function getCachedTranslation(key) {
  const item = translationCache.get(key);

  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    translationCache.delete(key);
    return null;
  }

  return item.value;
}

function setCachedTranslation(key, value) {
  if (translationCache.size >= MAX_CACHE_ITEMS) {
    const firstKey = translationCache.keys().next().value;

    if (firstKey) {
      translationCache.delete(firstKey);
    }
  }

  translationCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL
  });
}

function credentialsReady() {
  return Boolean(
    PROJECT_ID &&
    CLIENT_EMAIL &&
    PRIVATE_KEY
  );
}

/* =========================================================
   GOOGLE SERVICE ACCOUNT JWT
========================================================= */

function createServiceAccountJWT() {
  if (!CLIENT_EMAIL) {
    throw new Error(
      "GOOGLE_TRANSLATION_CLIENT_EMAIL is missing."
    );
  }

  if (!PRIVATE_KEY) {
    throw new Error(
      "GOOGLE_TRANSLATION_PRIVATE_KEY is missing."
    );
  }

  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const payload = {
    iss: CLIENT_EMAIL,
    scope: GOOGLE_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  };

  const unsignedToken =
    `${jsonBase64url(header)}.${jsonBase64url(payload)}`;

  const signer = crypto.createSign("RSA-SHA256");

  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(PRIVATE_KEY);

  return `${unsignedToken}.${base64url(signature)}`;
}

/* =========================================================
   GOOGLE ACCESS TOKEN
========================================================= */

async function getGoogleAccessToken() {
  const now = Date.now();

  /*
   * Reuse the token until shortly before expiration.
   */
  if (
    cachedAccessToken &&
    cachedAccessTokenExpiresAt > now + 60_000
  ) {
    return cachedAccessToken;
  }

  const assertion = createServiceAccountJWT();

  const body = new URLSearchParams();

  body.set(
    "grant_type",
    "urn:ietf:params:oauth:grant-type:jwt-bearer"
  );

  body.set(
    "assertion",
    assertion
  );

  const response = await fetch(TOKEN_URL, {
    method: "POST",

    headers: {
      "Content-Type":
        "application/x-www-form-urlencoded"
    },

    body: body.toString()
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error_description ||
      data?.error ||
      "Unable to obtain Google access token.";

    throw new Error(message);
  }

  if (!data.access_token) {
    throw new Error(
      "Google did not return an access token."
    );
  }

  cachedAccessToken = data.access_token;

  const expiresIn =
    Number(data.expires_in) || 3600;

  cachedAccessTokenExpiresAt =
    Date.now() + expiresIn * 1000;

  return cachedAccessToken;
}

/* =========================================================
   TRANSLATE ONE OR MORE TEXTS
========================================================= */

async function translateTexts({
  texts,
  sourceLanguage,
  targetLanguage,
  mimeType = "text/plain"
}) {
  const token = await getGoogleAccessToken();

  const payload = {
    contents: texts,
    targetLanguageCode: targetLanguage,
    mimeType:
      mimeType === "text/html"
        ? "text/html"
        : "text/plain"
  };

  /*
   * If source language is omitted, Google automatically
   * detects the source language.
   */
  if (
    sourceLanguage &&
    sourceLanguage !== "auto"
  ) {
    payload.sourceLanguageCode =
      sourceLanguage;
  }

  const response = await fetch(TRANSLATE_URL, {
    method: "POST",

    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },

    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message ||
      "Google Translation API request failed.";

    const error = new Error(message);

    error.status =
      Number(data?.error?.code) ||
      response.status ||
      500;

    throw error;
  }

  const translations =
    Array.isArray(data?.translations)
      ? data.translations
      : [];

  return translations;
}

/* =========================================================
   SUPPORTED LANGUAGES
========================================================= */

async function getSupportedLanguages(displayLanguage = "en") {
  const token = await getGoogleAccessToken();

  const url =
    `${LANGUAGES_URL}?displayLanguageCode=` +
    encodeURIComponent(displayLanguage || "en");

  const response = await fetch(url, {
    method: "GET",

    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message ||
      "Unable to load supported languages.";

    throw new Error(message);
  }

  const languages =
    Array.isArray(data?.languages)
      ? data.languages
      : [];

  return languages.map((item) => ({
    code: item.languageCode || "",
    name:
      item.displayName ||
      item.languageCode ||
      ""
  }));
}

/* =========================================================
   REQUEST BODY NORMALIZATION
========================================================= */

function normalizeRequestBody(body) {
  if (!body) return {};

  if (typeof body === "object") {
    return body;
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  return {};
}

function extractTexts(body) {
  /*
   * HAVKAR can send:
   *
   * { text: "Hello" }
   *
   * or
   *
   * { texts: ["Hello", "World"] }
   *
   * or Google's style:
   *
   * { contents: ["Hello"] }
   */

  if (Array.isArray(body.texts)) {
    return body.texts
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(body.contents)) {
    return body.contents
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof body.text === "string") {
    const text = cleanText(body.text);

    return text ? [text] : [];
  }

  if (typeof body.content === "string") {
    const text = cleanText(body.content);

    return text ? [text] : [];
  }

  if (typeof body.q === "string") {
    const text = cleanText(body.q);

    return text ? [text] : [];
  }

  return [];
}

function extractTargetLanguage(body) {
  return cleanLanguageCode(
    body.targetLanguage ||
    body.target_language ||
    body.targetLanguageCode ||
    body.target ||
    body.to ||
    body.language ||
    body.lang ||
    ""
  );
}

function extractSourceLanguage(body) {
  return cleanLanguageCode(
    body.sourceLanguage ||
    body.source_language ||
    body.sourceLanguageCode ||
    body.source ||
    body.from ||
    "auto"
  );
}

/* =========================================================
   HEALTH RESPONSE
========================================================= */

function healthResponse() {
  return {
    ok: true,

    service: "HAVKAR Translation API",

    provider: "Google Cloud Translation",

    version: "1.0.0",

    projectConfigured: Boolean(PROJECT_ID),

    credentialsConfigured: Boolean(
      CLIENT_EMAIL && PRIVATE_KEY
    ),

    endpoints: {
      translate: "POST /api/translate",
      languages:
        "GET /api/translate?action=languages",
      health:
        "GET /api/translate"
    }
  };
}

/* =========================================================
   MAIN VERCEL HANDLER
========================================================= */

module.exports = async function handler(req, res) {
  setCors(req, res);

  /* -------------------------------------------------------
     OPTIONS
  ------------------------------------------------------- */

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  /* -------------------------------------------------------
     GET
  ------------------------------------------------------- */

  if (req.method === "GET") {
    try {
      const action =
        String(req.query?.action || "")
          .trim()
          .toLowerCase();

      /*
       * GET /api/translate?action=languages
       */
      if (action === "languages") {
        if (!credentialsReady()) {
          return sendJSON(res, 500, {
            ok: false,
            error:
              "Google Translation credentials are not configured."
          });
        }

        const displayLanguage =
          cleanLanguageCode(
            req.query?.displayLanguage ||
            req.query?.display ||
            req.query?.lang ||
            "en"
          ) || "en";

        const languages =
          await getSupportedLanguages(
            displayLanguage
          );

        return sendJSON(res, 200, {
          ok: true,
          count: languages.length,
          languages
        });
      }

      /*
       * Default GET = health check
       */
      return sendJSON(
        res,
        200,
        healthResponse()
      );
    } catch (error) {
      console.error(
        "[HAVKAR Translation GET]",
        error
      );

      return sendJSON(res, 500, {
        ok: false,
        error:
          error?.message ||
          "Translation service error."
      });
    }
  }

  /* -------------------------------------------------------
     POST ONLY FROM HERE
  ------------------------------------------------------- */

  if (req.method !== "POST") {
    res.setHeader(
      "Allow",
      "GET, POST, OPTIONS"
    );

    return sendJSON(res, 405, {
      ok: false,
      error: "Method not allowed."
    });
  }

  try {
    /* -----------------------------------------------------
       VERIFY SERVER CONFIG
    ----------------------------------------------------- */

    if (!PROJECT_ID) {
      return sendJSON(res, 500, {
        ok: false,
        error:
          "Google Cloud project ID is not configured."
      });
    }

    if (!CLIENT_EMAIL) {
      return sendJSON(res, 500, {
        ok: false,
        error:
          "Google Translation service account email is not configured."
      });
    }

    if (!PRIVATE_KEY) {
      return sendJSON(res, 500, {
        ok: false,
        error:
          "Google Translation private key is not configured."
      });
    }

    /* -----------------------------------------------------
       READ REQUEST
    ----------------------------------------------------- */

    const body =
      normalizeRequestBody(req.body);

    const texts =
      extractTexts(body);

    const targetLanguage =
      extractTargetLanguage(body);

    const sourceLanguage =
      extractSourceLanguage(body);

    const mimeType =
      body.mimeType === "text/html" ||
      body.mime_type === "text/html"
        ? "text/html"
        : "text/plain";

    /* -----------------------------------------------------
       VALIDATION
    ----------------------------------------------------- */

    if (!texts.length) {
      return sendJSON(res, 400, {
        ok: false,
        error:
          "Text is required."
      });
    }

    if (!targetLanguage) {
      return sendJSON(res, 400, {
        ok: false,
        error:
          "Target language is required."
      });
    }

    if (texts.length > 100) {
      return sendJSON(res, 400, {
        ok: false,
        error:
          "Too many text items. Maximum is 100 per request."
      });
    }

    const totalCharacters =
      texts.reduce(
        (sum, item) =>
          sum + item.length,
        0
      );

    /*
     * HAVKAR-side protection against accidental
     * huge translation requests.
     */
    if (totalCharacters > 30000) {
      return sendJSON(res, 413, {
        ok: false,
        error:
          "Translation request is too large."
      });
    }

    /* -----------------------------------------------------
       CACHE CHECK
    ----------------------------------------------------- */

    const results =
      new Array(texts.length);

    const missingTexts = [];
    const missingIndexes = [];

    texts.forEach((text, index) => {
      const cacheKey =
        makeCacheKey(
          text,
          sourceLanguage,
          targetLanguage
        );

      const cached =
        getCachedTranslation(cacheKey);

      if (cached) {
        results[index] = {
          ...cached,
          cached: true
        };
      } else {
        missingTexts.push(text);
        missingIndexes.push(index);
      }
    });

    /* -----------------------------------------------------
       GOOGLE TRANSLATION
    ----------------------------------------------------- */

    if (missingTexts.length) {
      const googleTranslations =
        await translateTexts({
          texts: missingTexts,
          sourceLanguage,
          targetLanguage,
          mimeType
        });

      if (
        googleTranslations.length !==
        missingTexts.length
      ) {
        throw new Error(
          "Google returned an unexpected number of translations."
        );
      }

      googleTranslations.forEach(
        (translation, position) => {
          const originalIndex =
            missingIndexes[position];

          const originalText =
            missingTexts[position];

          const translatedText =
            translation?.translatedText ||
            "";

          const detectedLanguage =
            translation?.detectedLanguageCode ||
            (
              sourceLanguage === "auto"
                ? ""
                : sourceLanguage
            );

          const normalized = {
            text: translatedText,
            translatedText,
            sourceLanguage:
              detectedLanguage ||
              sourceLanguage ||
              "auto",
            targetLanguage,
            cached: false
          };

          results[originalIndex] =
            normalized;

          const cacheKey =
            makeCacheKey(
              originalText,
              sourceLanguage,
              targetLanguage
            );

          setCachedTranslation(
            cacheKey,
            normalized
          );
        }
      );
    }

    /* -----------------------------------------------------
       RESPONSE
    ----------------------------------------------------- */

    /*
     * For a single text we return both:
     *
     * translatedText
     * translation
     * text
     *
     * This makes the endpoint easier to connect to
     * different HAVKAR pages without exposing Google
     * credentials to the browser.
     */

    if (results.length === 1) {
      const result = results[0];

      return sendJSON(res, 200, {
        ok: true,

        translatedText:
          result.translatedText,

        translation:
          result.translatedText,

        text:
          result.translatedText,

        sourceLanguage:
          result.sourceLanguage,

        targetLanguage:
          result.targetLanguage,

        cached:
          Boolean(result.cached),

        translations: results
      });
    }

    return sendJSON(res, 200, {
      ok: true,

      sourceLanguage,

      targetLanguage,

      translations: results
    });

  } catch (error) {
    console.error(
      "[HAVKAR Translation API]",
      error
    );

    const status =
      Number(error?.status) >= 400 &&
      Number(error?.status) <= 599
        ? Number(error.status)
        : 500;

    return sendJSON(res, status, {
      ok: false,

      error:
        error?.message ||
        "Translation failed."
    });
  }
};
