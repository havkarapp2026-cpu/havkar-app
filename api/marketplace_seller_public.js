import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  buildMarketplaceSellerPublicPayload
} = require("../lib/marketplace-seller-public.cjs");

let supabaseAdminClient = null;

function sendError(res, status, message) {
  return res.status(status).json({
    ok: false,
    error: message
  });
}

function getSupabaseAdmin() {
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );
  }
  return supabaseAdminClient;
}

function readListingId(req) {
  const fromQuery =
    req && req.query
      ? req.query.listing_id || req.query.id || req.query.ad_id
      : null;
  const fromBody =
    req && req.body
      ? req.body.listing_id || req.body.id || req.body.ad_id
      : null;
  return String(fromQuery || fromBody || "").trim();
}

async function readBearerUserId(req) {
  const header = String(
    (req && req.headers && (req.headers.authorization || req.headers.Authorization)) ||
      ""
  ).trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return "";
  }
  try {
    const loaded = await getSupabaseAdmin().auth.getUser(match[1]);
    return loaded && loaded.data && loaded.data.user && loaded.data.user.id
      ? String(loaded.data.user.id)
      : "";
  } catch (_err) {
    return "";
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Accept"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return sendError(res, 405, "Method not allowed");
  }

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return sendError(res, 503, "Seller public profile unavailable");
    }

    const listingId = readListingId(req);
    if (!listingId) {
      return sendError(res, 400, "listing_id is required");
    }

    const { data: ad, error: adError } = await getSupabaseAdmin()
      .from("ads")
      .select("id,user_id,status,listing_surface")
      .eq("id", listingId)
      .maybeSingle();

    if (adError) {
      return sendError(res, 500, "Could not load listing for seller profile");
    }
    if (!ad || !ad.user_id) {
      return sendError(res, 404, "Listing not found");
    }
    if (
      ad.listing_surface &&
      String(ad.listing_surface).toLowerCase() !== "marketplace"
    ) {
      return sendError(res, 404, "Listing not found");
    }

    const status =
      String(ad.status || "active")
        .trim()
        .toLowerCase() || "active";
    const publicStatuses = new Set(["active", "published", "reserved"]);
    if (!publicStatuses.has(status)) {
      const requesterId = await readBearerUserId(req);
      if (!requesterId || requesterId !== String(ad.user_id)) {
        return sendError(res, 404, "Listing not found");
      }
    }

    const { data: profile } = await getSupabaseAdmin()
      .from("profiles")
      .select("full_name,avatar_url,country,city,created_at")
      .eq("id", ad.user_id)
      .maybeSingle();

    let authUser = null;
    try {
      const loaded = await getSupabaseAdmin().auth.admin.getUserById(ad.user_id);
      authUser = loaded && loaded.data && loaded.data.user;
    } catch (_authErr) {
      authUser = null;
    }

    const payload = buildMarketplaceSellerPublicPayload({
      listingId: ad.id,
      sellerUserId: ad.user_id,
      profile: profile || null,
      authUser: authUser || null
    });
    return res.status(200).json(payload);
  } catch (error) {
    console.error(
      "marketplace_seller_public GET failed",
      error && error.message
    );
    return sendError(res, 500, "Seller public profile unavailable");
  }
}
