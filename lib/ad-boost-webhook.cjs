"use strict";

/*
  Stripe Ads boost TEST MODE webhook logic.
  Hosted inside /api/stripe-webhook (rewrite from /api/ad-boost-webhook).
  Does not require HAVKAR_REAL_PAYMENTS_ENABLED.
*/

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

function adsBoostTestAllowed(env) {
  if (env.HAVKAR_ADS_BOOST_TEST_ENABLED !== "true") return false;
  const key = String(env.STRIPE_SECRET_KEY || "");
  return key.startsWith("sk_test_");
}

function resolveAdsWebhookSecret(env) {
  return (
    env.STRIPE_ADS_BOOST_WEBHOOK_SECRET ||
    env.STRIPE_WEBHOOK_SECRET ||
    ""
  );
}

async function tryConstructAdsBoostEvent(rawBody, stripeSignature, env) {
  if (!adsBoostTestAllowed(env)) {
    return { handled: false };
  }

  const secret = resolveAdsWebhookSecret(env);
  if (!secret || !stripeSignature) {
    return { handled: false };
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, stripeSignature, secret);
  } catch (error) {
    return { handled: false, signatureError: error };
  }

  if (
    event.type === "checkout.session.completed" &&
    event.data?.object?.metadata?.havkar_flow === "ad_boost" &&
    event.data?.object?.metadata?.test_mode === "true"
  ) {
    return { handled: true, event };
  }

  return { handled: false, event };
}

async function processAdsBoostEvent(event, env) {
  const session = event.data.object;

  if (session.payment_status !== "paid") {
    return { received: true };
  }

  const intentId = Number(session.metadata.ad_boost_intent_id);
  if (!Number.isSafeInteger(intentId) || intentId <= 0) {
    return { received: true };
  }

  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: existing } = await supabase
    .from("ad_boost_intents")
    .select("id,status,test_mode")
    .eq("id", intentId)
    .maybeSingle();

  if (!existing || existing.test_mode !== true) {
    return { received: true };
  }

  if (existing.status === "paid") {
    return { received: true, duplicate: true };
  }

  await supabase
    .from("ad_boost_intents")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_session_id: session.id
    })
    .eq("id", intentId)
    .eq("test_mode", true);

  await supabase.from("ad_audit_events").insert({
    ad_id: Number(session.metadata.ad_id) || null,
    actor_id: null,
    action: "boost_paid_test",
    meta: { intent_id: intentId, session_id: session.id }
  });

  return { received: true, test_mode: true };
}

module.exports = {
  adsBoostTestAllowed,
  tryConstructAdsBoostEvent,
  processAdsBoostEvent
};
