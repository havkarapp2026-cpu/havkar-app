/**
 * HAVKAR Travel Plus — €4.99/mo + 30-day trial subscription.
 * Free GPS / My trips / memories / reminders / base map stay FREE always.
 * Checkout and charging stay OFF until Owner arms env flags + Stripe Price.
 * No real charge is created by unit tests or when sales_enabled is false.
 */

const TRAVEL_PLUS = Object.freeze({
  product_id: "havkar_travel_plus",
  display_name: "HAVKAR Travel Plus",
  currency: "EUR",
  price_monthly: 4.99,
  price_cents: 499,
  trial_days: 30,
  stripe_mode: "subscription",
  free_tier: Object.freeze([
    "Personal GPS trip recording (with geo consent)",
    "My trips history, map replay, monthly/yearly stats",
    "Private travel memories / albums (cloud when signed in)",
    "Opt-in anniversary reminders (in-app; email when enabled)",
    "Licensed public cameras (LIVE vs JPEG honesty)",
    "133 display currencies + XLM rail status (payment only when legally/technically armed)",
    "Base map on Tickets and Accommodation",
    "TomTom place search and routing (evaluation quota)",
    "Offline IndexedDB queue for track points + sync when online"
  ]),
  paid_exclusive: Object.freeze([
    "Extended cloud trip history retention (24 months vs free 90-day window)",
    "Higher smart-guide digest quota (grounded rules; still no invented fares)",
    "Priority routing refresh windows within TomTom contract limits",
    "Saved multi-destination compare sets across devices"
  ]),
  cancel_and_renew_terms: Object.freeze({
    trial:
      "30-day free trial starts only after Owner enables checkout and the signed-in user starts Travel Plus in Stripe Checkout. No charge during trial when a payment method is on file for renew.",
    renew:
      "After trial, auto-renew is €4.99/month via Stripe Billing when auto_renew is armed and the customer keeps a valid payment method.",
    cancel:
      "Cancel anytime from the Stripe Customer Portal (Manage subscription). Access continues through the paid period already purchased; no silent renewals while checkout is OFF.",
    tax:
      "Stripe Tax (automatic_tax) is used when Owner enables HAVKAR_TRAVEL_PLUS_AUTOMATIC_TAX=true and Tax is configured in the Stripe Dashboard for the customer’s location.",
    honesty:
      "Card data never touches HAVKAR servers (Stripe Checkout / Elements PCI). Entitlement is written only from verified Stripe webhooks."
  }),
  honesty:
    "Travel Plus adds optional paid smart value — never resells free basemaps or Commons photos. Existing free Tickets travel features stay free even when Travel Plus is armed."
});

function flagTrue(env, name) {
  return String((env && env[name]) || "").trim().toLowerCase() === "true";
}

function stripePriceId(env) {
  return String(
    (env && (env.STRIPE_TRAVEL_PLUS_PRICE_ID || env.HAVKAR_TRAVEL_PLUS_STRIPE_PRICE_ID)) ||
      ""
  ).trim();
}

function readGates(env) {
  const e = env || process.env;
  const sales = flagTrue(e, "HAVKAR_TRAVEL_PLUS_SALES_ENABLED");
  const checkout = flagTrue(e, "HAVKAR_TRAVEL_PLUS_CHECKOUT_ENABLED");
  const billing = flagTrue(e, "HAVKAR_TRAVEL_PLUS_BILLING_ENABLED");
  const autoRenew = flagTrue(e, "HAVKAR_TRAVEL_PLUS_AUTO_RENEW_ENABLED");
  const automaticTax = flagTrue(e, "HAVKAR_TRAVEL_PLUS_AUTOMATIC_TAX");
  const priceId = stripePriceId(e);
  const stripeSecret = Boolean(String((e && e.STRIPE_SECRET_KEY) || "").trim());
  const portalConfigured = flagTrue(e, "HAVKAR_TRAVEL_PLUS_PORTAL_READY");
  return {
    sales_enabled: sales,
    checkout_enabled: checkout,
    billing_enabled: billing,
    auto_renew_enabled: autoRenew,
    automatic_tax_enabled: automaticTax,
    stripe_price_id_present: Boolean(priceId),
    stripe_price_id: priceId || null,
    stripe_secret_configured: stripeSecret,
    portal_ready: portalConfigured,
    armed: sales && checkout && billing && Boolean(priceId) && stripeSecret
  };
}

function ownerPrerequisites(env) {
  const g = readGates(env);
  const missing = [];
  if (!g.stripe_secret_configured) {
    missing.push("Bind STRIPE_SECRET_KEY on Vercel Production (live key for real sales).");
  }
  if (!g.stripe_price_id_present) {
    missing.push(
      "Create Stripe Product/Price €4.99/month EUR recurring and set STRIPE_TRAVEL_PLUS_PRICE_ID."
    );
  }
  if (!g.sales_enabled) {
    missing.push("Set HAVKAR_TRAVEL_PLUS_SALES_ENABLED=true after Owner approval.");
  }
  if (!g.checkout_enabled) {
    missing.push("Set HAVKAR_TRAVEL_PLUS_CHECKOUT_ENABLED=true to allow Checkout Sessions.");
  }
  if (!g.billing_enabled) {
    missing.push("Set HAVKAR_TRAVEL_PLUS_BILLING_ENABLED=true so webhooks grant entitlement.");
  }
  if (!g.auto_renew_enabled) {
    missing.push(
      "Set HAVKAR_TRAVEL_PLUS_AUTO_RENEW_ENABLED=true to allow post-trial renew (optional until first go-live)."
    );
  }
  if (!g.automatic_tax_enabled) {
    missing.push(
      "Optional: activate Stripe Tax + set HAVKAR_TRAVEL_PLUS_AUTOMATIC_TAX=true for VAT/GST."
    );
  }
  if (!g.portal_ready) {
    missing.push(
      "Configure Stripe Customer Portal (cancel/update payment method) and set HAVKAR_TRAVEL_PLUS_PORTAL_READY=true."
    );
  }
  missing.push(
    "Apply supabase migration travel_plus_subscriptions (owner RLS) before first live subscriber."
  );
  missing.push(
    "Confirm stripe-webhook endpoint receives customer.subscription.* and invoice.* for this account."
  );
  return {
    ready_for_owner_arm: g.stripe_secret_configured && g.stripe_price_id_present,
    armed: g.armed,
    missing,
    free_features_remain_free: true,
    no_real_payment_in_unit_tests: true
  };
}

function travelPlusStatus(env) {
  const gates = readGates(env);
  const prereq = ownerPrerequisites(env);
  return {
    ok: true,
    product: {
      ...TRAVEL_PLUS,
      sales_enabled: gates.sales_enabled,
      billing_enabled: gates.billing_enabled,
      auto_renew_enabled: gates.auto_renew_enabled,
      checkout_enabled: gates.checkout_enabled,
      automatic_tax_enabled: gates.automatic_tax_enabled
    },
    armed: gates.armed,
    user_chargeable: gates.armed && gates.auto_renew_enabled,
    sales_enabled: gates.sales_enabled,
    billing_enabled: gates.billing_enabled,
    auto_renew_enabled: gates.auto_renew_enabled,
    checkout_enabled: gates.checkout_enabled,
    automatic_tax_enabled: gates.automatic_tax_enabled,
    stripe_price_configured: gates.stripe_price_id_present,
    free_features_preserved: true,
    paid_exclusive: TRAVEL_PLUS.paid_exclusive,
    owner_prerequisites: prereq,
    message: gates.armed
      ? "HAVKAR Travel Plus is armed for Checkout (€4.99/mo, 30-day trial). Free GPS / My trips / memories / reminders stay free."
      : "HAVKAR Travel Plus ready at €4.99/month with 30-day trial — sales/checkout remain OFF until Owner completes prerequisites. Free features stay free."
  };
}

function buildCheckoutSessionParams({
  env,
  origin,
  userId,
  customerEmail,
  customerId
}) {
  const gates = readGates(env);
  if (!gates.armed) {
    return {
      ok: false,
      error: "travel_plus_not_armed",
      status: 403,
      owner_prerequisites: ownerPrerequisites(env)
    };
  }
  if (!userId) {
    return { ok: false, error: "sign_in_required", status: 401 };
  }

  const base = String(origin || "https://havkar.online").replace(/\/$/, "");
  const successUrl =
    base +
    "/tickets.html?travel_plus=success&session_id={CHECKOUT_SESSION_ID}#mode-reminders";
  const cancelUrl = base + "/tickets.html?travel_plus=cancelled#mode-reminders";

  const params = {
    mode: "subscription",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: String(userId),
    line_items: [{ price: gates.stripe_price_id, quantity: 1 }],
    subscription_data: {
      trial_period_days: TRAVEL_PLUS.trial_days,
      trial_settings: {
        end_behavior: { missing_payment_method: "cancel" }
      },
      metadata: {
        havkar_flow: "travel_plus",
        havkar_purpose: "travel_plus_subscription",
        havkar_product_id: TRAVEL_PLUS.product_id,
        havkar_user_id: String(userId)
      }
    },
    metadata: {
      havkar_flow: "travel_plus",
      havkar_purpose: "travel_plus_subscription",
      havkar_product_id: TRAVEL_PLUS.product_id,
      havkar_user_id: String(userId),
      price_eur: "4.99",
      trial_days: String(TRAVEL_PLUS.trial_days)
    },
    allow_promotion_codes: false,
    billing_address_collection: "required"
  };

  if (customerId) params.customer = customerId;
  else if (customerEmail) {
    params.customer_email = customerEmail;
    params.customer_creation = "always";
  }

  if (gates.automatic_tax_enabled) {
    params.automatic_tax = { enabled: true };
    params.customer_update = { address: "auto", name: "auto" };
  }

  /* Collect payment method during trial so renew can charge after 30 days when armed. */
  params.payment_method_collection = "always";

  if (!gates.auto_renew_enabled) {
    /* Still create subscription with trial, but Owner has not armed renew — honesty in metadata. */
    params.metadata.auto_renew_armed = "false";
    params.subscription_data.metadata.auto_renew_armed = "false";
  } else {
    params.metadata.auto_renew_armed = "true";
    params.subscription_data.metadata.auto_renew_armed = "true";
  }

  return {
    ok: true,
    params,
    idempotencyKey:
      "havkar-travel-plus-" +
      String(userId) +
      "-" +
      new Date().toISOString().slice(0, 13),
    security: {
      pci: "Stripe Checkout hosted — card data never hits HAVKAR servers",
      auth: "Bearer session required",
      webhook_entitlement_only: true
    }
  };
}

function buildPortalSessionParams({ env, origin, customerId }) {
  const gates = readGates(env);
  if (!gates.sales_enabled || !gates.portal_ready) {
    return {
      ok: false,
      error: "travel_plus_portal_not_ready",
      status: 403,
      owner_prerequisites: ownerPrerequisites(env)
    };
  }
  if (!customerId) {
    return { ok: false, error: "stripe_customer_required", status: 400 };
  }
  const base = String(origin || "https://havkar.online").replace(/\/$/, "");
  return {
    ok: true,
    params: {
      customer: customerId,
      return_url: base + "/tickets.html?travel_plus=portal_return#mode-reminders"
    }
  };
}

function billingPurpose(object) {
  const meta = (object && object.metadata) || {};
  if (meta.havkar_purpose) return String(meta.havkar_purpose);
  if (meta.havkar_flow === "travel_plus") return "travel_plus_subscription";
  if (object && object.subscription_details && object.subscription_details.metadata) {
    const m = object.subscription_details.metadata;
    if (m.havkar_purpose) return String(m.havkar_purpose);
    if (m.havkar_flow === "travel_plus") return "travel_plus_subscription";
  }
  return "";
}

function isTravelPlusEvent(event) {
  const type = event && event.type;
  const object = event && event.data && event.data.object;
  const purpose = billingPurpose(object);
  if (type === "checkout.session.completed") {
    return purpose === "travel_plus_subscription" || (object && object.metadata && object.metadata.havkar_flow === "travel_plus");
  }
  return (
    purpose === "travel_plus_subscription" &&
    (type === "invoice.paid" ||
      type === "invoice.payment_failed" ||
      type === "customer.subscription.updated" ||
      type === "customer.subscription.deleted" ||
      type === "customer.subscription.trial_will_end")
  );
}

function normalizeSubscriptionRow({
  userId,
  customerId,
  subscriptionId,
  status,
  priceId,
  trialEnd,
  currentPeriodEnd,
  cancelAtPeriodEnd,
  livemode
}) {
  return {
    user_id: userId,
    stripe_customer_id: customerId || null,
    stripe_subscription_id: subscriptionId || null,
    stripe_price_id: priceId || null,
    status: status || "incomplete",
    trial_end: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
    current_period_end: currentPeriodEnd
      ? new Date(currentPeriodEnd * 1000).toISOString()
      : null,
    cancel_at_period_end: Boolean(cancelAtPeriodEnd),
    livemode: livemode === true,
    updated_at: new Date().toISOString()
  };
}

async function upsertSubscription(supabase, row) {
  if (!supabase || !row || !row.user_id) {
    return { ok: false, error: "upsert_requires_user" };
  }
  const { data, error } = await supabase
    .from("travel_plus_subscriptions")
    .upsert(row, { onConflict: "user_id" })
    .select("user_id,status,stripe_subscription_id,cancel_at_period_end,current_period_end")
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      error: error.message || "upsert_failed",
      migration_pending: /travel_plus_subscriptions|schema cache|relation/i.test(
        String(error.message || "")
      )
    };
  }
  return { ok: true, subscription: data };
}

async function applyVerifiedCheckoutSession({ supabase, event, session, env }) {
  const gates = readGates(env);
  if (!gates.billing_enabled) {
    return { ok: false, error: "travel_plus_billing_off", activate: false };
  }
  if (!session || session.mode !== "subscription") {
    return { ok: false, error: "not_subscription_session", activate: false };
  }
  const userId =
    (session.metadata && session.metadata.havkar_user_id) ||
    session.client_reference_id;
  if (!userId) return { ok: false, error: "missing_user", activate: false };

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription && session.subscription.id;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer && session.customer.id;

  const row = normalizeSubscriptionRow({
    userId: String(userId),
    customerId,
    subscriptionId,
    status: "trialing_or_active",
    priceId: gates.stripe_price_id,
    livemode: event && event.livemode === true
  });
  /* Prefer explicit status from expanded subscription when present */
  if (session.subscription && typeof session.subscription === "object") {
    row.status = session.subscription.status || row.status;
    row.trial_end = session.subscription.trial_end
      ? new Date(session.subscription.trial_end * 1000).toISOString()
      : row.trial_end;
    row.current_period_end = session.subscription.current_period_end
      ? new Date(session.subscription.current_period_end * 1000).toISOString()
      : row.current_period_end;
    row.cancel_at_period_end = Boolean(session.subscription.cancel_at_period_end);
  }

  const saved = await upsertSubscription(supabase, row);
  return {
    ok: saved.ok,
    activate: saved.ok,
    travel_plus: true,
    ...saved,
    free_features_preserved: true
  };
}

async function applyVerifiedBillingEvent({ supabase, event, env }) {
  const gates = readGates(env);
  if (!gates.billing_enabled) {
    return { ok: false, error: "travel_plus_billing_off" };
  }
  if (!isTravelPlusEvent(event)) {
    return { ok: false, error: "not_travel_plus_event" };
  }
  const type = event.type;
  const object = event.data && event.data.object;
  if (!object) return { ok: false, error: "missing_object" };

  let subscription = object;
  if (type === "invoice.paid" || type === "invoice.payment_failed") {
    /* invoice carries subscription id + metadata may be on subscription */
    subscription = {
      id: typeof object.subscription === "string" ? object.subscription : null,
      customer: object.customer,
      status: type === "invoice.paid" ? "active" : "past_due",
      metadata: object.subscription_details && object.subscription_details.metadata
        ? object.subscription_details.metadata
        : object.metadata || {},
      current_period_end: object.lines && object.lines.data && object.lines.data[0]
        ? object.lines.data[0].period && object.lines.data[0].period.end
        : null,
      cancel_at_period_end: false
    };
  }

  const userId =
    (subscription.metadata && subscription.metadata.havkar_user_id) ||
    (object.metadata && object.metadata.havkar_user_id);
  if (!userId) {
    return { ok: false, error: "missing_user_on_subscription", note: "Lookup by customer may be needed later." };
  }

  let status = subscription.status || "active";
  if (type === "customer.subscription.deleted") status = "canceled";
  if (type === "invoice.payment_failed") status = "past_due";

  const row = normalizeSubscriptionRow({
    userId: String(userId),
    customerId:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer && subscription.customer.id,
    subscriptionId: subscription.id,
    status,
    priceId: gates.stripe_price_id,
    trialEnd: subscription.trial_end,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    livemode: event.livemode === true
  });

  const saved = await upsertSubscription(supabase, row);
  return {
    ok: saved.ok,
    travel_plus: true,
    event_type: type,
    ...saved,
    free_features_preserved: true
  };
}

function isEntitledStatus(status) {
  return status === "active" || status === "trialing" || status === "trialing_or_active";
}

async function loadEntitlement(supabase, userId) {
  if (!supabase || !userId) {
    return {
      ok: false,
      entitled: false,
      free_features_preserved: true,
      error: "sign_in_required"
    };
  }
  const { data, error } = await supabase
    .from("travel_plus_subscriptions")
    .select(
      "status,stripe_customer_id,stripe_subscription_id,cancel_at_period_end,current_period_end,trial_end"
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      entitled: false,
      free_features_preserved: true,
      error: error.message,
      migration_pending: /travel_plus_subscriptions|schema cache|relation/i.test(
        String(error.message || "")
      )
    };
  }
  const entitled = Boolean(data && isEntitledStatus(data.status));
  return {
    ok: true,
    entitled,
    subscription: data || null,
    paid_exclusive_unlocked: entitled ? TRAVEL_PLUS.paid_exclusive : [],
    free_features_preserved: true,
    free_tier: TRAVEL_PLUS.free_tier
  };
}

module.exports = {
  TRAVEL_PLUS,
  travelPlusStatus,
  ownerPrerequisites,
  readGates,
  buildCheckoutSessionParams,
  buildPortalSessionParams,
  isTravelPlusEvent,
  applyVerifiedCheckoutSession,
  applyVerifiedBillingEvent,
  loadEntitlement,
  upsertSubscription,
  normalizeSubscriptionRow,
  isEntitledStatus
};
