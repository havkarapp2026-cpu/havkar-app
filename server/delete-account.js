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

function authenticatedUserId(user) {
  const id = user?.id;

  if (typeof id !== "string") {
    return "";
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? id
    : "";
}

function canContinueAfterSignOut(error) {
  const status = Number(error?.status);

  return status === 401 || status === 403 || status === 404;
}

function requestPath(req) {
  const url = typeof req?.url === "string" ? req.url : "";

  return url.split("?")[0];
}

function routeMarker(req) {
  const query = req?.query;

  if (!query || typeof query !== "object" || Array.isArray(query)) {
    return { kind: "absent" };
  }

  if (!Object.prototype.hasOwnProperty.call(query, "havkarRoute")) {
    return { kind: "absent" };
  }

  const value = query.havkarRoute;

  if (value === "delete-account") {
    return { kind: "exact" };
  }

  if (
    Array.isArray(value) &&
    value.length === 1 &&
    value[0] === "delete-account"
  ) {
    return { kind: "exact" };
  }

  return { kind: "rejected" };
}

function isDeleteAccountPath(req) {
  const path = requestPath(req);

  return path === "/api/delete-account" || path.endsWith("/api/delete-account");
}

export function isDeleteAccountRequest(req) {
  const marker = routeMarker(req);

  if (marker.kind === "exact") {
    return true;
  }

  if (marker.kind === "rejected") {
    return false;
  }

  return isDeleteAccountPath(req);
}

export function isAmbiguousDeleteAccountRequest(req) {
  return routeMarker(req).kind === "rejected";
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

    let userResult;

    try {
      userResult = await admin.auth.getUser(accessToken);
    } catch {
      console.error("Account authentication failed.");

      return sendJson(res, 401, {
        ok: false,
        error: "Authentication required."
      });
    }

    const userId = authenticatedUserId(userResult?.data?.user);

    if (!userResult || userResult.error || !userId) {
      return sendJson(res, 401, {
        ok: false,
        error: "Authentication required."
      });
    }

    let deletionAllowed;

    try {
      deletionAllowed = await admin.rpc("havkar_account_deletion_allowed", {
        p_user_id: userId
      });
    } catch {
      console.error("Account deletion check failed.");

      return sendJson(res, 500, {
        ok: false,
        error: "The account could not be deleted."
      });
    }

    if (!deletionAllowed || deletionAllowed.error || deletionAllowed.data == null) {
      console.error("Account deletion check failed.");

      return sendJson(res, 500, {
        ok: false,
        error: "The account could not be deleted."
      });
    }

    if (deletionAllowed.data !== true) {
      return sendJson(res, 403, {
        ok: false,
        error: "This account cannot be deleted."
      });
    }

    let revoked;

    try {
      revoked = await admin.auth.admin.signOut(accessToken, "global");
    } catch {
      console.error("Account session revocation failed.");

      return sendJson(res, 500, {
        ok: false,
        error: "The account could not be deleted."
      });
    }

    if (revoked?.error && !canContinueAfterSignOut(revoked.error)) {
      console.error("Account session revocation failed.");

      return sendJson(res, 500, {
        ok: false,
        error: "The account could not be deleted."
      });
    }

    let deleted;

    try {
      deleted = await admin.auth.admin.deleteUser(userId);
    } catch {
      console.error("Account deletion failed.");

      return sendJson(res, 500, {
        ok: false,
        error: "The account could not be deleted."
      });
    }

    if (!deleted || deleted.error) {
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
