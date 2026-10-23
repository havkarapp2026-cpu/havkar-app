"use strict";

const RECEIPTS_PREVIEW_BRANCH = "cursor/message-receipts-6a44";

const BLOCKED_PREVIEW_API_PATHS = [
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

function isIsolatedReceiptsPreview(env = process.env) {
  return env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === RECEIPTS_PREVIEW_BRANCH;
}

function rejectIsolatedPreview(res, env = process.env) {
  if (!isIsolatedReceiptsPreview(env)) {
    return false;
  }

  res.status(503).json({
    ok: false,
    error: "This API is disabled on the isolated message-receipts preview."
  });

  return true;
}

function assertServerCredentialsAllowed(env = process.env) {
  if (!isIsolatedReceiptsPreview(env)) {
    return;
  }

  const error = new Error(
    "Server credentials are disabled on the isolated message-receipts preview."
  );
  error.code = "ISOLATED_PREVIEW";
  throw error;
}

function isolatedPreviewApiBlock(pathname, env = process.env) {
  if (!isIsolatedReceiptsPreview(env)) {
    return null;
  }

  const pathOnly = String(pathname || "").split("?")[0];
  const blocked = BLOCKED_PREVIEW_API_PATHS.some((item) => pathOnly === item);

  if (!blocked) {
    return null;
  }

  return {
    status: 503,
    body: {
      ok: false,
      error: "This API is disabled on the isolated message-receipts preview."
    }
  };
}

module.exports = {
  RECEIPTS_PREVIEW_BRANCH,
  BLOCKED_PREVIEW_API_PATHS,
  isIsolatedReceiptsPreview,
  rejectIsolatedPreview,
  assertServerCredentialsAllowed,
  isolatedPreviewApiBlock
};
