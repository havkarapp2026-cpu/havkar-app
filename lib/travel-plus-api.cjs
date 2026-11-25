/**
 * Travel Plus HTTP actions: status / checkout / portal / entitlement.
 * Never charges when Owner gates are off. No card data on HAVKAR servers.
 */

const {
  travelPlusStatus,
  buildCheckoutSessionParams,
  buildPortalSessionParams,
  loadEntitlement,
  ownerPrerequisites
} = require("./havkar-travel-plus.cjs");

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function handleTravelPlusAction({
  action,
  req,
  res,
  body,
  env,
  authenticateUser,
  getStripe,
  getSupabaseAdmin,
  publicOrigin
}) {
  const e = env || process.env;

  if (action === "travel_plus_status" || action === "map_travel_plus_status") {
    return send(res, 200, travelPlusStatus(e));
  }

  if (action === "travel_plus_owner_prerequisites") {
    return send(res, 200, {
      ok: true,
      action,
      ...ownerPrerequisites(e),
      product: travelPlusStatus(e).product
    });
  }

  if (action === "travel_plus_entitlement") {
    const auth = await authenticateUser(req);
    if (!auth.user) {
      return send(res, 401, { ok: false, error: auth.error || "Authentication required" });
    }
    let admin = null;
    try {
      admin = getSupabaseAdmin();
    } catch (_err) {
      return send(res, 503, { ok: false, error: "supabase_unavailable" });
    }
    const ent = await loadEntitlement(admin, auth.user.id);
    return send(res, ent.ok ? 200 : 503, {
      action,
      ...ent,
      status_snapshot: travelPlusStatus(e)
    });
  }

  if (action === "travel_plus_checkout") {
    const auth = await authenticateUser(req);
    if (!auth.user) {
      return send(res, 401, { ok: false, error: auth.error || "Authentication required" });
    }
    const built = buildCheckoutSessionParams({
      env: e,
      origin: publicOrigin,
      userId: auth.user.id,
      customerEmail: auth.user.email || null
    });
    if (!built.ok) {
      return send(res, built.status || 403, {
        ok: false,
        action,
        error: built.error,
        owner_prerequisites: built.owner_prerequisites || ownerPrerequisites(e),
        free_features_preserved: true,
        charge_created: false
      });
    }
    if (!String((e && e.STRIPE_SECRET_KEY) || "").trim()) {
      return send(res, 503, {
        ok: false,
        error: "stripe_not_configured",
        charge_created: false
      });
    }
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create(built.params, {
        idempotencyKey: built.idempotencyKey
      });
      return send(res, 200, {
        ok: true,
        action,
        checkout_url: session.url,
        session_id: session.id,
        mode: session.mode,
        trial_days: 30,
        price_eur: 4.99,
        charge_created: false,
        note:
          "Stripe Checkout Session created. Customer completes payment/trial on Stripe-hosted page. No card data on HAVKAR.",
        security: built.security,
        free_features_preserved: true
      });
    } catch (err) {
      return send(res, 502, {
        ok: false,
        error: "stripe_checkout_failed",
        detail: String((err && err.message) || "unknown").slice(0, 200),
        charge_created: false
      });
    }
  }

  if (action === "travel_plus_portal") {
    const auth = await authenticateUser(req);
    if (!auth.user) {
      return send(res, 401, { ok: false, error: auth.error || "Authentication required" });
    }
    let admin = null;
    try {
      admin = getSupabaseAdmin();
    } catch (_err) {
      return send(res, 503, { ok: false, error: "supabase_unavailable" });
    }
    const ent = await loadEntitlement(admin, auth.user.id);
    const customerId =
      ent.subscription && ent.subscription.stripe_customer_id
        ? ent.subscription.stripe_customer_id
        : null;
    const built = buildPortalSessionParams({
      env: e,
      origin: publicOrigin,
      customerId
    });
    if (!built.ok) {
      return send(res, built.status || 403, {
        ok: false,
        action,
        error: built.error,
        owner_prerequisites: built.owner_prerequisites || ownerPrerequisites(e),
        entitlement: ent
      });
    }
    try {
      const stripe = getStripe();
      const portal = await stripe.billingPortal.sessions.create(built.params);
      return send(res, 200, {
        ok: true,
        action,
        portal_url: portal.url,
        note: "Stripe Customer Portal for cancel / payment method / invoices.",
        free_features_preserved: true
      });
    } catch (err) {
      return send(res, 502, {
        ok: false,
        error: "stripe_portal_failed",
        detail: String((err && err.message) || "unknown").slice(0, 200)
      });
    }
  }

  return null;
}

module.exports = {
  handleTravelPlusAction
};
