import { createClient } from "npm:@supabase/supabase-js@2";

const STAGING_ORIGIN = "https://staging.havkar.online";
const STAGING_SUPABASE_URL = "https://keglioewbkgdabsizvys.supabase.co";

function json(status, body, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
  if (origin === STAGING_ORIGIN) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function bearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return "";
  const token = header.slice(7).trim();
  if (!token || token.startsWith("sb_") || token.split(".").length !== 3) return "";
  return token;
}

function testStripeKey() {
  const key = String(Deno.env.get("STRIPE_SECRET_KEY") || "");
  return key.startsWith("sk_test_") ? key : "";
}

function priceId(plan) {
  const value = plan === "plus"
    ? Deno.env.get("STRIPE_AI_PLUS_PRICE_ID")
    : plan === "pro"
      ? Deno.env.get("STRIPE_AI_PRO_PRICE_ID")
      : "";
  return typeof value === "string" && value.startsWith("price_") ? value : "";
}

function unavailable(headers) {
  return json(503, {
    ok: false,
    error: "Stripe test mode is not configured for HAVKAR AI subscriptions."
  }, headers);
}

async function stripeForm(path, key, fields, idempotencyKey) {
  const headers: Record<string, string> = {
    Authorization: "Bearer " + key,
    "Content-Type": "application/x-www-form-urlencoded"
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const response = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields)
  });
  const payload = await response.json().catch(() => null);
  return { ok: response.ok, payload };
}

async function stripeGet(path, key) {
  const response = await fetch("https://api.stripe.com/v1/" + path, {
    headers: { Authorization: "Bearer " + key }
  });
  const payload = await response.json().catch(() => null);
  return { ok: response.ok, payload };
}

function allowedReturnUrl(value) {
  return typeof value === "string" && (
    value.startsWith("https://checkout.stripe.com/") ||
    value.startsWith("https://billing.stripe.com/")
  );
}

async function signedInUser(admin, request) {
  const accessToken = bearerToken(request);
  if (!accessToken) return null;
  const userResult = await admin.auth.getUser(accessToken);
  return userResult.error || !userResult.data?.user?.id ? null : userResult.data.user;
}

async function checkout(request, headers, admin, body) {
  if (request.headers.get("Origin") !== STAGING_ORIGIN) {
    return json(403, { ok: false, error: "Live HAVKAR AI payments are not approved." }, headers);
  }
  const key = testStripeKey();
  const plan = body && (body.plan === "plus" || body.plan === "pro") ? body.plan : "";
  const price = priceId(plan);
  if (!key || !Deno.env.get("STRIPE_AI_PLUS_PRICE_ID") || !Deno.env.get("STRIPE_AI_PRO_PRICE_ID")) {
    return unavailable(headers);
  }
  if (!plan || !price) {
    return json(400, { ok: false, error: "Choose a supported assistant plan." }, headers);
  }
  const user = await signedInUser(admin, request);
  if (!user) return json(401, { ok: false, error: "Sign in before using the assistant." }, headers);
  const day = new Date().toISOString().slice(0, 10);
  const session = await stripeForm("checkout/sessions", key, {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: STAGING_ORIGIN + "/havkar-ai.html",
    cancel_url: STAGING_ORIGIN + "/havkar-ai.html",
    client_reference_id: user.id,
    "metadata[havkar_product]": "ai_subscription",
    "metadata[user_id]": user.id,
    "metadata[plan]": plan,
    "subscription_data[metadata][havkar_product]": "ai_subscription",
    "subscription_data[metadata][user_id]": user.id,
    "subscription_data[metadata][plan]": plan
  }, "havkar-ai-" + user.id + "-" + plan + "-" + day);
  const url = session.payload && session.payload.url;
  if (!session.ok || !allowedReturnUrl(url) || !url.startsWith("https://checkout.stripe.com/")) {
    return json(502, { ok: false, error: "The assistant is temporarily unavailable." }, headers);
  }
  return json(200, { ok: true, url }, headers);
}

async function portal(request, headers, admin) {
  if (request.headers.get("Origin") !== STAGING_ORIGIN) {
    return json(403, { ok: false, error: "Live HAVKAR AI payments are not approved." }, headers);
  }
  const key = testStripeKey();
  if (!key || !Deno.env.get("STRIPE_AI_PLUS_PRICE_ID") || !Deno.env.get("STRIPE_AI_PRO_PRICE_ID")) {
    return unavailable(headers);
  }
  const user = await signedInUser(admin, request);
  if (!user) return json(401, { ok: false, error: "Sign in before using the assistant." }, headers);
  const subscription = await admin
    .from("ai_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const customerId = subscription.data && subscription.data.stripe_customer_id;
  if (subscription.error || !customerId || !String(customerId).startsWith("cus_")) {
    return json(409, { ok: false, error: "No billing account exists for this assistant plan." }, headers);
  }
  const session = await stripeForm("billing_portal/sessions", key, {
    customer: customerId,
    return_url: STAGING_ORIGIN + "/havkar-ai.html"
  }, "");
  const url = session.payload && session.payload.url;
  if (!session.ok || !allowedReturnUrl(url) || !url.startsWith("https://billing.stripe.com/")) {
    return json(502, { ok: false, error: "The assistant is temporarily unavailable." }, headers);
  }
  return json(200, { ok: true, url }, headers);
}

function hex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function sameHex(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function stripeSignatureValid(payload, header, secret) {
  const parts = String(header || "").split(",");
  let timestamp = "";
  const signatures = [];
  for (const part of parts) {
    const item = part.trim();
    if (item.startsWith("t=")) timestamp = item.slice(2);
    if (item.startsWith("v1=")) signatures.push(item.slice(3));
  }
  const age = Math.abs((Date.now() / 1000) - Number(timestamp));
  if (!timestamp || !signatures.length || !Number.isFinite(age) || age > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(timestamp + "." + payload)
  );
  const expected = hex(new Uint8Array(mac));
  return signatures.some((signature) => sameHex(signature, expected));
}

function planFromMetadata(metadata) {
  const plan = metadata && metadata.plan;
  return plan === "plus" || plan === "pro" ? plan : "";
}

async function webhook(request, headers, admin) {
  const key = testStripeKey();
  const secret = String(Deno.env.get("STRIPE_WEBHOOK_SECRET") || "");
  if (!key || !secret.startsWith("whsec_")) return unavailable(headers);
  const payload = await request.text();
  const valid = await stripeSignatureValid(payload, request.headers.get("stripe-signature") || "", secret);
  if (!valid) return json(400, { ok: false, error: "Invalid webhook signature." }, headers);
  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json(400, { ok: false, error: "Invalid webhook signature." }, headers);
  }
  const object = event && event.data && event.data.object ? event.data.object : {};
  let metadata = object.metadata || {};
  const nested = object.subscription_details || (object.parent && object.parent.subscription_details) || null;
  if (nested && nested.metadata && nested.metadata.havkar_product) metadata = nested.metadata;
  if (metadata.havkar_product !== "ai_subscription" && event.type === "invoice.payment_failed" && typeof object.subscription === "string" && object.subscription.startsWith("sub_")) {
    const retrieved = await stripeGet("subscriptions/" + encodeURIComponent(object.subscription), key);
    metadata = retrieved.ok && retrieved.payload && retrieved.payload.metadata ? retrieved.payload.metadata : {};
    if (metadata.havkar_product !== "ai_subscription") {
      return json(200, { ok: true, ignored: true }, headers);
    }
  }
  if (!event || metadata.havkar_product !== "ai_subscription") {
    return json(200, { ok: true, ignored: true }, headers);
  }
  const seen = await admin.rpc("record_ai_billing_event", { p_event_id: event.id });
  if (seen.error) return json(503, { ok: false, error: "The assistant is temporarily unavailable." }, headers);
  if (seen.data !== true) return json(200, { ok: true, duplicate: true }, headers);
  const userId = metadata.user_id || object.client_reference_id || "";
  const plan = planFromMetadata(metadata);
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !plan) {
    return json(200, { ok: true, ignored: true }, headers);
  }
  let status = "incomplete";
  if (event.type === "checkout.session.completed" && object.status === "complete") status = "active";
  if (event.type === "customer.subscription.deleted") status = "canceled";
  if (event.type === "customer.subscription.updated") {
    status = ["active", "past_due", "canceled", "unpaid", "incomplete"].includes(object.status)
      ? object.status
      : "incomplete";
  }
  if (event.type === "invoice.payment_failed") status = "past_due";
  const periodEnd = Number.isInteger(object.current_period_end)
    ? new Date(object.current_period_end * 1000).toISOString()
    : null;
  const saved = await admin.from("ai_subscriptions").upsert({
    user_id: userId,
    plan_code: status === "active" ? plan : "free",
    status,
    stripe_customer_id: typeof object.customer === "string" ? object.customer : null,
    stripe_subscription_id: typeof object.subscription === "string" ? object.subscription : (typeof object.id === "string" ? object.id : null),
    current_period_end: periodEnd,
    cancel_at_period_end: object.cancel_at_period_end === true,
    updated_at: new Date().toISOString()
  });
  if (saved.error) return json(503, { ok: false, error: "The assistant is temporarily unavailable." }, headers);
  return json(200, { ok: true }, headers);
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json(405, { ok: false, error: "Method not allowed." }, headers);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (supabaseUrl !== STAGING_SUPABASE_URL || !serviceRoleKey) {
    return json(503, { ok: false, error: "HAVKAR configuration was not found on this page." }, headers);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const action = new URL(request.url).searchParams.get("action");
  if (action === "webhook" || request.headers.get("stripe-signature")) {
    return webhook(request, headers, admin);
  }
  const bodyText = await request.text();
  let body = null;
  try { body = JSON.parse(bodyText); } catch { body = null; }
  const name = body && body.action === "portal" ? "portal" : body && body.action === "checkout" ? "checkout" : "";
  if (name === "portal") return portal(request, headers, admin);
  if (name === "checkout") return checkout(request, headers, admin, body);
  return json(400, { ok: false, error: "Choose a supported assistant plan." }, headers);
});
