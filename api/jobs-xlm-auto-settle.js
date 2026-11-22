/*
 * Automatic Jobs XLM settlement endpoint.
 *
 * Auth modes:
 * 1) Vercel Cron (x-vercel-cron: 1) or Authorization: Bearer CRON_SECRET
 *    → sweep all unpaid non-expired jobs_listing intents
 * 2) Authenticated user Bearer JWT
 *    → sweep only that user's unpaid jobs_listing intents
 *
 * Never activates without Horizon-confirmed amount+destination+memo match.
 * Does not change public Jobs tariffs. Does not invent payments.
 */

const { createClient } = require("@supabase/supabase-js");
const {
  autoSettleJobsXlmIntents,
  authorizeAutoSettleRequest
} = require("../lib/jobs-xlm-auto-settle.cjs");

function getSupabaseAdmin() {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    throw new Error("Supabase admin is not configured.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function resolveUser(req, admin) {
  const auth = String(
    (req.headers && (req.headers.authorization || req.headers.Authorization)) ||
      ""
  );
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) {
    return { user: null, error: "missing_bearer" };
  }
  const token = match[1].trim();
  if (!token || token === String(process.env.CRON_SECRET || "").trim()) {
    return { user: null, error: "not_user_token" };
  }
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data || !data.user) {
      return { user: null, error: "invalid_token" };
    }
    return { user: data.user, error: null };
  } catch (_err) {
    return { user: null, error: "auth_failed" };
  }
}

function readIntentId(req) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const q = req.query && typeof req.query === "object" ? req.query : {};
  return String(body.intent_id || q.intent_id || "").trim() || null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({
      ok: false,
      error: "Method not allowed."
    });
  }

  try {
    const admin = getSupabaseAdmin();
    const cronAuth = authorizeAutoSettleRequest(req, process.env);
    const intentId = readIntentId(req);
    let userId = null;
    let mode = cronAuth.mode;

    if (!cronAuth.ok) {
      const auth = await resolveUser(req, admin);
      if (!auth.user) {
        return res.status(401).json({
          ok: false,
          code: "AUTH_REQUIRED",
          error:
            "Cron secret or signed-in user is required for Jobs XLM auto-settle."
        });
      }
      userId = auth.user.id;
      mode = "user";
    }

    const sweep = await autoSettleJobsXlmIntents(admin, {
      userId: userId,
      intentId: intentId,
      fetchImpl: fetch,
      env: process.env
    });

    return res.status(200).json({
      ok: sweep.ok === true,
      mode: mode,
      scanned: sweep.scanned,
      settled: sweep.settled,
      activated: sweep.activated,
      results: sweep.results,
      error: sweep.error || null
    });
  } catch (err) {
    console.error("jobs-xlm-auto-settle failed", err && err.message);
    return res.status(500).json({
      ok: false,
      code: "AUTO_SETTLE_ERROR",
      error: "Jobs XLM auto-settle could not complete."
    });
  }
};
