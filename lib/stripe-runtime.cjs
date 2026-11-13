"use strict";

/*
 * Safe Stripe + Supabase runtime helpers for API routes.
 * Never logs secret values. Fail closed on Preview/staging misconfig.
 */

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const { stripeSecretMode } = require("./real-payments.cjs");

const STAGING_SUPABASE_HOST = "keglioewbkgdabsizvys.supabase.co";
const PRODUCTION_SUPABASE_HOST = "gispovnciifgikvgpzck.supabase.co";

const CONFIG_ERROR_CODE = "STRIPE_RUNTIME_CONFIG_ERROR";

function isPreviewRuntime(env = process.env) {
  return (
    env.VERCEL_ENV === "preview" ||
    env.HAVKAR_RUNTIME_ISOLATION === "staging" ||
    String(env.VERCEL_GIT_COMMIT_REF || "").includes("stripe-test-mode-staging")
  );
}

function supabaseHost(env = process.env) {
  try {
    return new URL(String(env.SUPABASE_URL || "")).host;
  } catch (_err) {
    return "";
  }
}

function isStagingSupabase(env = process.env) {
  return supabaseHost(env) === STAGING_SUPABASE_HOST;
}

function isProductionSupabase(env = process.env) {
  return supabaseHost(env) === PRODUCTION_SUPABASE_HOST;
}

/**
 * Preview/staging must never use live Stripe keys or the Production DB.
 * Returns null when OK, otherwise a non-sensitive diagnostic object.
 */
function stagingIsolationFailure(env = process.env) {
  const preview = isPreviewRuntime(env);
  const stagingDb = isStagingSupabase(env);
  const mode = stripeSecretMode(env);

  if (!preview && !stagingDb) {
    return null;
  }

  if (mode === "live") {
    return {
      code: CONFIG_ERROR_CODE,
      error: "Live Stripe secret refused on staging/preview",
      secret_key_mode: mode,
      isolation: "fail_closed"
    };
  }

  if (mode === "publishable_misconfigured" || mode === "unknown") {
    return {
      code: CONFIG_ERROR_CODE,
      error: "STRIPE_SECRET_KEY mode is invalid for staging",
      secret_key_mode: mode,
      isolation: "fail_closed"
    };
  }

  if (preview && isProductionSupabase(env)) {
    return {
      code: CONFIG_ERROR_CODE,
      error: "Preview/staging must not use Production Supabase",
      secret_key_mode: mode,
      supabase_target: "production",
      isolation: "fail_closed"
    };
  }

  if (stagingDb && mode === "missing") {
    return {
      code: CONFIG_ERROR_CODE,
      error: "STRIPE_SECRET_KEY missing for staging",
      secret_key_mode: "missing",
      isolation: "fail_closed"
    };
  }

  return null;
}

function createStripeClient(env = process.env) {
  const mode = stripeSecretMode(env);
  if (mode === "missing") {
    return { ok: false, mode, client: null, reason: "STRIPE_SECRET_KEY missing" };
  }
  if (mode === "publishable_misconfigured" || mode === "unknown") {
    return {
      ok: false,
      mode,
      client: null,
      reason: "STRIPE_SECRET_KEY has invalid mode"
    };
  }

  const isolation = stagingIsolationFailure(env);
  if (isolation) {
    return {
      ok: false,
      mode,
      client: null,
      reason: isolation.error,
      isolation
    };
  }

  const key = String(env.STRIPE_SECRET_KEY || "")
    .trim()
    .replace(/^["']|["']$/g, "");

  try {
    return { ok: true, mode, client: new Stripe(key) };
  } catch (_err) {
    return {
      ok: false,
      mode,
      client: null,
      reason: "Stripe client initialization failed"
    };
  }
}

function createServiceSupabase(env = process.env) {
  const isolation = stagingIsolationFailure(env);
  if (isolation && isolation.supabase_target === "production") {
    return { ok: false, client: null, reason: isolation.error, isolation };
  }

  const url = String(env.SUPABASE_URL || "").trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    return {
      ok: false,
      client: null,
      reason: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing"
    };
  }

  return {
    ok: true,
    client: createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  };
}

function configErrorResponse(res, detail) {
  return res.status(503).json({
    ok: false,
    code: CONFIG_ERROR_CODE,
    error: "Webhook configuration error",
    detail: detail || "missing_or_invalid_runtime_config"
  });
}

module.exports = {
  STAGING_SUPABASE_HOST,
  PRODUCTION_SUPABASE_HOST,
  CONFIG_ERROR_CODE,
  isPreviewRuntime,
  isStagingSupabase,
  isProductionSupabase,
  stagingIsolationFailure,
  createStripeClient,
  createServiceSupabase,
  configErrorResponse
};
