import { createClient } from "@supabase/supabase-js";

export const DELETE_ACCOUNT_ORIGINS = Object.freeze([
  "https://havkar-app.vercel.app",
  "https://testnet.havkar.online",
  "https://localhost",
  "capacitor://localhost"
]);

const ORIGINS = new Set(DELETE_ACCOUNT_ORIGINS);

function headerValue(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  const selected = Array.isArray(value) ? value[0] : value;

  return typeof selected === "string" ? selected.trim() : "";
}

function applyCors(req, res) {
  const origin = headerValue(req, "origin");

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (origin && ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);

    return true;
  }

  return !origin;
}

function sendJson(res, status, body) {
  res.status(status).json(body);
}

function bearerToken(req) {
  const header = headerValue(req, "authorization");

  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length).trim();
}

function confirmation(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }

  return body.confirm === "DELETE" && Object.keys(body).length === 1;
}

function defaultAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function createDeleteAccountHandler({ getAdmin = defaultAdmin } = {}) {
  return async function handler(req, res) {
    if (!applyCors(req, res)) {
      return sendJson(res, 403, {
        ok: false,
        error: "Origin is not allowed."
      });
    }

    if (req.method === "OPTIONS") {
      res.status(204);
      return res.end();
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");

      return sendJson(res, 405, {
        ok: false,
        error: "Method not allowed."
      });
    }

    const accessToken = bearerToken(req);

    if (!accessToken) {
      return sendJson(res, 401, {
        ok: false,
        error: "Authentication required."
      });
    }

    if (!confirmation(req.body)) {
      return sendJson(res, 400, {
        ok: false,
        error: "Type DELETE to confirm account deletion."
      });
    }

    const admin = getAdmin();

    if (!admin) {
      console.error("Account deletion is not configured.");

      return sendJson(res, 500, {
        ok: false,
        error: "The account could not be deleted."
      });
    }

    const userResult = await admin.auth.getUser(accessToken);

    if (userResult.error || !userResult.data?.user?.id) {
      return sendJson(res, 401, {
        ok: false,
        error: "Authentication required."
      });
    }

    const deleted = await admin.auth.admin.deleteUser(userResult.data.user.id);

    if (deleted.error) {
      console.error("Account deletion failed.");

      return sendJson(res, 500, {
        ok: false,
        error: "The account could not be deleted."
      });
    }

    return sendJson(res, 200, { ok: true });
  };
}

export default createDeleteAccountHandler();
