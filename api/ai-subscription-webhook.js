import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import {
  enforcedSupabaseUrl,
  requestHostname
} from "../server/supabase-target.cjs";

export const config = {
  api: {
    bodyParser: false
  }
};

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function planFromMetadata(metadata) {
  const plan = metadata && metadata.plan;
  return plan === "plus" || plan === "pro" ? plan : "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  if (requestHostname(req) !== "staging.havkar.online") {
    return res.status(403).json({
      ok: false,
      error: "Live HAVKAR AI payments are not approved."
    });
  }

  const key = process.env.STRIPE_SECRET_KEY || "";

  if (!key.startsWith("sk_test_") || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({
      ok: false,
      error: "Stripe test mode is not configured for HAVKAR AI subscriptions."
    });
  }

  const supabaseUrl = enforcedSupabaseUrl(req, process.env.SUPABASE_URL);

  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ ok: false, error: "HAVKAR configuration was not found on this page." });
  }

  let event;

  try {
    const stripe = new Stripe(key);
    event = stripe.webhooks.constructEvent(
      await rawBody(req),
      req.headers["stripe-signature"] || "",
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid webhook signature." });
  }

  const object = event.data && event.data.object ? event.data.object : {};
  let metadata = object.metadata || {};
  const nested = object.subscription_details
    || (object.parent && object.parent.subscription_details)
    || null;
  if (nested && nested.metadata && nested.metadata.havkar_product) metadata = nested.metadata;
  if (metadata.havkar_product !== "ai_subscription" && event.type === "invoice.payment_failed" && typeof object.subscription === "string") {
    try {
      const subscription = await new Stripe(key).subscriptions.retrieve(object.subscription);
      metadata = subscription && subscription.metadata ? subscription.metadata : {};
    } catch {
      return res.status(200).json({ ok: true, ignored: true });
    }
  }

  if (metadata.havkar_product !== "ai_subscription") {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const seen = await admin.rpc("record_ai_billing_event", { p_event_id: event.id });

  if (seen.error) {
    return res.status(503).json({ ok: false, error: "The assistant is temporarily unavailable." });
  }

  if (seen.data !== true) {
    return res.status(200).json({ ok: true, duplicate: true });
  }

  const userId = metadata.user_id || object.client_reference_id || "";
  const plan = planFromMetadata(metadata);

  if (!/^[0-9a-f-]{36}$/i.test(userId) || !plan) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  let status = "incomplete";

  if (event.type === "checkout.session.completed" && object.status === "complete") status = "active";
  if (event.type === "customer.subscription.deleted") status = "canceled";
  if (event.type === "customer.subscription.updated") {
    status = object.status === "active" || object.status === "past_due" || object.status === "canceled" || object.status === "unpaid" || object.status === "incomplete"
      ? object.status
      : "incomplete";
  }
  if (event.type === "invoice.payment_failed") status = "past_due";

  const periodEnd = object.current_period_end
    ? new Date(object.current_period_end * 1000).toISOString()
    : null;
  const saved = await admin.from("ai_subscriptions").upsert({
    user_id: userId,
    plan_code: status === "active" ? plan : "free",
    status,
    stripe_customer_id: object.customer || null,
    stripe_subscription_id: object.subscription || object.id || null,
    current_period_end: periodEnd,
    cancel_at_period_end: object.cancel_at_period_end === true,
    updated_at: new Date().toISOString()
  });

  if (saved.error) {
    return res.status(503).json({ ok: false, error: "The assistant is temporarily unavailable." });
  }

  return res.status(200).json({ ok: true });
}
