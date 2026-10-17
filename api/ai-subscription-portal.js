import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import {
  enforcedSupabaseUrl,
  requestHostname
} from "../server/supabase-target.cjs";
import { subscriptionCheckoutStatus } from "../supabase/functions/havkar-ai-assistant/policy.mjs";

function bearer(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  const token = header.slice(7).trim();
  if (!token || token.startsWith("sb_") || token.split(".").length !== 3) return "";
  return token;
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

  const supabaseUrl = enforcedSupabaseUrl(req, process.env.SUPABASE_URL);

  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({
      ok: false,
      error: "HAVKAR configuration was not found on this page."
    });
  }

  const gate = subscriptionCheckoutStatus(process.env);

  if (!gate.ok) {
    return res.status(gate.status).json({ ok: false, error: gate.error });
  }

  const accessToken = bearer(req);

  if (!accessToken) {
    return res.status(401).json({ ok: false, error: "Sign in before using the assistant." });
  }

  const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const userResult = await admin.auth.getUser(accessToken);

  if (userResult.error || !userResult.data?.user?.id) {
    return res.status(401).json({ ok: false, error: "Sign in before using the assistant." });
  }

  const subscription = await admin
    .from("ai_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userResult.data.user.id)
    .maybeSingle();
  const customerId = subscription.data && subscription.data.stripe_customer_id;

  if (subscription.error || !customerId || !String(customerId).startsWith("cus_")) {
    return res.status(409).json({
      ok: false,
      error: "No billing account exists for this assistant plan."
    });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: "https://staging.havkar.online/havkar-ai.html"
  });

  if (!session || !session.url || !session.url.startsWith("https://billing.stripe.com/")) {
    return res.status(502).json({ ok: false, error: "The assistant is temporarily unavailable." });
  }

  return res.status(200).json({ ok: true, url: session.url });
}
