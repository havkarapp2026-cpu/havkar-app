"use strict";

const RECEIPTS_PREVIEW_BRANCH = "cursor/message-receipts-6a44";

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

module.exports = {
  RECEIPTS_PREVIEW_BRANCH,
  isIsolatedReceiptsPreview,
  rejectIsolatedPreview,
  assertServerCredentialsAllowed
};
