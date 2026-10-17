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

  const hostname = requestHostname(req);

  if (hostname !== "staging.havkar.online") {
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

  const plan = req.body && (req.body.plan === "plus" || req.body.plan === "pro")
    ? req.body.plan
    : "";
  const price = plan === "plus"
    ? process.env.STRIPE_AI_PLUS_PRICE_ID
    : process.env.STRIPE_AI_PRO_PRICE_ID;

  if (!plan || !price) {
    return res.status(400).json({ ok: false, error: "Choose a supported assistant plan." });
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

  const origin = hostname === "staging.havkar.online"
    ? "https://staging.havkar.online"
    : "https://" + hostname;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    success_url: origin + "/havkar-ai.html",
    cancel_url: origin + "/havkar-ai.html",
    client_reference_id: userResult.data.user.id,
    metadata: {
      havkar_product: "ai_subscription",
      user_id: userResult.data.user.id,
      plan
    },
    subscription_data: {
      metadata: {
        havkar_product: "ai_subscription",
        user_id: userResult.data.user.id,
        plan
      }
    }
  }, {
    idempotencyKey: "havkar-ai-" + userResult.data.user.id + "-" + plan + "-" + new Date().toISOString().slice(0, 10)
  });

  if (!session || !session.url || !session.url.startsWith("https://checkout.stripe.com/")) {
    return res.status(502).json({ ok: false, error: "The assistant is temporarily unavailable." });
  }

  return res.status(200).json({ ok: true, url: session.url });
}
