"use strict";

/*
  HAVKAR Ads boost Checkout — Stripe TEST MODE preparation only.
  Served via /api/create-event-checkout?havkarAction=adBoost
  (rewrite from /api/create-ad-boost-checkout).
*/

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

function send(res, status, body) {
  return res.status(status).json(body);
}

function bearerToken(req) {
  const header = req.headers?.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  const authorization = typeof value === "string" ? value : "";
  if (!authorization.startsWith("Bearer ")) return "";
  return authorization.slice(7).trim();
}

function adsBoostTestAllowed(env) {
  if (env.HAVKAR_ADS_BOOST_TEST_ENABLED !== "true") {
    return false;
  }
  const key = String(env.STRIPE_SECRET_KEY || "");
  if (!key.startsWith("sk_test_")) {
    return false;
  }
  if (env.HAVKAR_STRIPE_LIVE_ENABLED === "true") {
    return false;
  }
  return true;
}

function isAdBoostCheckoutRequest(req) {
  const action = String((req && req.body && req.body.action) || "");
  const url = String((req && req.url) || "");
  return Boolean(
    (req && req.query && req.query.havkarAction === "adBoost") ||
      url.indexOf("create-ad-boost-checkout") !== -1 ||
      action === "ad_boost_checkout"
  );
}

async function handleAdBoostCheckout(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, error: "Method not allowed" });
  }

  if (!adsBoostTestAllowed(process.env)) {
    return send(res, 403, {
      ok: false,
      error:
        "Ads boost Checkout is prepared for Stripe test mode only. Owner must set HAVKAR_ADS_BOOST_TEST_ENABLED=true with sk_test_ keys. Live charges stay off.",
      code: "ADS_BOOST_TEST_DISABLED"
    });
  }

  const accessToken = bearerToken(req);
  if (!accessToken) {
    return send(res, 401, { ok: false, error: "Authentication required" });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return send(res, 500, { ok: false, error: "Server configuration error" });
  }

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const auth = await admin.auth.getUser(accessToken);
  const user = auth && auth.data && auth.data.user;
  if (!user) {
    return send(res, 401, { ok: false, error: "Invalid or expired session" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (body.test_mode !== true) {
    return send(res, 400, {
      ok: false,
      error: "Ads boost requires test_mode: true."
    });
  }

  const adId = Number(body.ad_id);
  if (!Number.isSafeInteger(adId) || adId <= 0) {
    return send(res, 400, { ok: false, error: "A valid ad_id is required." });
  }

  const loaded = await admin
    .from("ads")
    .select("id,user_id,listing_surface,status,title")
    .eq("id", adId)
    .eq("listing_surface", "advertising")
    .maybeSingle();

  const ad = loaded && loaded.data;
  if (!ad || String(ad.user_id) !== String(user.id)) {
    return send(res, 404, {
      ok: false,
      error: "Advertisement not found for this advertiser."
    });
  }

  const amountCents = 500;
  const currency = "eur";
  const origin = String(
    req.headers.origin ||
      process.env.HAVKAR_PUBLIC_ORIGIN ||
      "https://havkar-app.vercel.app"
  ).replace(/\/$/, "");

  const intentInsert = await admin
    .from("ad_boost_intents")
    .insert({
      ad_id: adId,
      user_id: user.id,
      amount_cents: amountCents,
      currency: currency,
      status: "created",
      test_mode: true
    })
    .select("id")
    .single();

  if (intentInsert.error || !intentInsert.data) {
    return send(res, 500, {
      ok: false,
      error:
        intentInsert.error?.message ||
        "Could not create boost intent. Apply ads lifecycle migration first."
    });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url:
      origin +
      "/ad-view.html?id=" +
      encodeURIComponent(String(adId)) +
      "&boost=success",
    cancel_url:
      origin +
      "/ad-view.html?id=" +
      encodeURIComponent(String(adId)) +
      "&boost=cancel",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency,
          unit_amount: amountCents,
          product_data: {
            name: "HAVKAR Ads boost (TEST)",
            description: "Test-mode boost for advertisement #" + adId
          }
        }
      }
    ],
    metadata: {
      havkar_flow: "ad_boost",
      ad_id: String(adId),
      ad_boost_intent_id: String(intentInsert.data.id),
      test_mode: "true"
    }
  });

  await admin
    .from("ad_boost_intents")
    .update({
      stripe_session_id: session.id,
      status: "checkout_open"
    })
    .eq("id", intentInsert.data.id);

  return send(res, 200, {
    ok: true,
    test_mode: true,
    url: session.url,
    intent_id: intentInsert.data.id
  });
}

module.exports = {
  adsBoostTestAllowed,
  isAdBoostCheckoutRequest,
  handleAdBoostCheckout
};
