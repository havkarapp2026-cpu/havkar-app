"use strict";

const PAYMENT_PREVIEW_BRANCH = "cursor/stellar-xlm-payments-6a44";
const PRODUCTION_PROJECT_REF = "gispovnciifgikvgpzck";
const STAGING_SUPABASE_URL = "https://keglioewbkgdabsizvys.supabase.co";
const STAGING_PUBLISHABLE_SHA256 =
  "fc969bfcab60e3823ddc0459bff97e90490384acb60384bceda786bd53db98c3";
const BROWSER_CONFIG_PATH = "/havkar-supabase-config.js";
const BROWSER_CONFIG_UNAVAILABLE = {
  status: 503,
  contentType: "application/json; charset=utf-8",
  body: JSON.stringify({
    ok: false,
    error: "Staging browser configuration is unavailable."
  })
};

/*
 * /api/translate is not in this list. The language engine calls it
 * for the selected interface language. The handler itself refuses
 * the production database while this preview is active.
 */
const BLOCKED_PAYMENT_PREVIEW_API_PATHS = [
  "/api/pi-approve",
  "/api/pi-complete",
  "/api/pi-a2u-testnet",
  "/api/stripe-webhook",
  "/api/create-event-checkout",
  "/api/trade-crypto",
  "/api/flights",
  "/api/flight-offer",
  "/api/flight-order",
  "/api/accommodation-review",
  "/api/business-application-notify"
];

function isIsolatedPaymentPreview(env = process.env) {
  return env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === PAYMENT_PREVIEW_BRANCH;
}

function isolatedPaymentPreviewApiBlock(pathname, env = process.env) {
  if (!isIsolatedPaymentPreview(env)) {
    return null;
  }

  const pathOnly = String(pathname || "").split("?")[0];
  const blocked = BLOCKED_PAYMENT_PREVIEW_API_PATHS.some((item) => pathOnly === item);

  if (!blocked) {
    return null;
  }

  return {
    status: 503,
    body: {
      ok: false,
      error: "This API is disabled on the isolated Stellar payment preview."
    }
  };
}

function readEnvValue(env, name) {
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
}

async function sha256Hex(value) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle || typeof TextEncoder === "undefined") {
    return "";
  }

  const digest = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (byte) => {
    return byte.toString(16).padStart(2, "0");
  }).join("");
}

function browserConfigSource(url, publishableKey) {
  return [
    "window.HAVKAR_SUPABASE_CONFIG = {",
    `  url: ${JSON.stringify(url)},`,
    `  publishableKey: ${JSON.stringify(publishableKey)}`,
    "};",
    ""
  ].join("\n");
}

async function isolatedPaymentPreviewBrowserConfig(pathname, env = process.env, options = {}) {
  const pathOnly = String(pathname || "").split("?")[0];
  if (pathOnly !== BROWSER_CONFIG_PATH || !isIsolatedPaymentPreview(env)) {
    return null;
  }

  const expectedHash = options.expectedPublishableSha256 || STAGING_PUBLISHABLE_SHA256;
  const url = readEnvValue(env, "HAVKAR_STAGING_SUPABASE_URL");
  const publishableKey = readEnvValue(env, "HAVKAR_STAGING_PUBLISHABLE_KEY");
  const keyHash = publishableKey ? await sha256Hex(publishableKey) : "";
  const keyIsPublic = publishableKey.startsWith("sb_publishable_")
    && !publishableKey.includes("service_role")
    && !publishableKey.startsWith("eyJ")
    && !publishableKey.includes(PRODUCTION_PROJECT_REF);
  const source = keyIsPublic ? browserConfigSource(url, publishableKey) : "";
  const sourceIsSafe = source
    && source.includes(STAGING_SUPABASE_URL)
    && !source.includes(PRODUCTION_PROJECT_REF)
    && !source.includes("service_role")
    && !source.includes("eyJ");

  if (
    url !== STAGING_SUPABASE_URL
    || !keyIsPublic
    || keyHash !== expectedHash
    || !sourceIsSafe
  ) {
    return BROWSER_CONFIG_UNAVAILABLE;
  }

  return {
    status: 200,
    contentType: "application/javascript; charset=utf-8",
    body: source
  };
}

module.exports = {
  PAYMENT_PREVIEW_BRANCH,
  PRODUCTION_PROJECT_REF,
  STAGING_SUPABASE_URL,
  STAGING_PUBLISHABLE_SHA256,
  BROWSER_CONFIG_PATH,
  BLOCKED_PAYMENT_PREVIEW_API_PATHS,
  isIsolatedPaymentPreview,
  isolatedPaymentPreviewApiBlock,
  isolatedPaymentPreviewBrowserConfig
};
