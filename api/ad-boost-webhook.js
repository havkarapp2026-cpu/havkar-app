"use strict";

/*
  Stripe webhook for HAVKAR Ads boost TEST MODE only.
  Separate from /api/stripe-webhook so paused real payments stay closed.
  Requires HAVKAR_ADS_BOOST_TEST_ENABLED=true and sk_test_ keys.
*/

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function adsBoostTestAllowed(env) {
  if (env.HAVKAR_ADS_BOOST_TEST_ENABLED !== "true") return false;
  const key = String(env.STRIPE_SECRET_KEY || "");
  return key.startsWith("sk_test_");
}

async function handler(req, res) {
  if (!adsBoostTestAllowed(process.env)) {
    return res.status(403).json({
      ok: false,
      error: "Ads boost test webhook disabled."
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const stripeSignature = req.headers["stripe-signature"];
  const secret =
    process.env.STRIPE_ADS_BOOST_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSignature || !secret) {
    return res.status(400).json({
      error: "Missing Stripe signature or webhook secret"
    });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      await getRawBody(req),
      stripeSignature,
      secret
    );
  } catch (error) {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;

  if (
    session.metadata?.havkar_flow !== "ad_boost" ||
    session.metadata?.test_mode !== "true"
  ) {
    return res.status(200).json({ received: true, ignored: true });
  }

  if (session.payment_status !== "paid") {
    return res.status(200).json({ received: true });
  }

  const intentId = Number(session.metadata.ad_boost_intent_id);

  if (!Number.isSafeInteger(intentId) || intentId <= 0) {
    return res.status(200).json({ received: true });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: existing } = await supabase
    .from("ad_boost_intents")
    .select("id,status,test_mode")
    .eq("id", intentId)
    .maybeSingle();

  if (!existing || existing.test_mode !== true) {
    return res.status(200).json({ received: true });
  }

  if (existing.status === "paid") {
    return res.status(200).json({ received: true, duplicate: true });
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

  return res.status(200).json({ received: true, test_mode: true });
}

handler.config = {
  api: {
    bodyParser: false
  }
};

module.exports = handler;
