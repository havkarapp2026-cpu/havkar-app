"use strict";

const PAYMENT_PREVIEW_BRANCH = "cursor/stellar-xlm-payments-6a44";
const PRODUCTION_PROJECT_REF = "gispovnciifgikvgpzck";
const STAGING_SUPABASE_URL = "https://keglioewbkgdabsizvys.supabase.co";

const BLOCKED_PAYMENT_PREVIEW_API_PATHS = [
  "/api/pi-approve",
  "/api/pi-complete",
  "/api/pi-a2u-testnet",
  "/api/stripe-webhook",
  "/api/create-event-checkout",
  "/api/trade-crypto",
  "/api/translate",
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

module.exports = {
  PAYMENT_PREVIEW_BRANCH,
  PRODUCTION_PROJECT_REF,
  STAGING_SUPABASE_URL,
  BLOCKED_PAYMENT_PREVIEW_API_PATHS,
  isIsolatedPaymentPreview,
  isolatedPaymentPreviewApiBlock
};
