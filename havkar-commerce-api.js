/*
 * Shared route handler for job and service payment endpoints.
 * It is not a Vercel function by itself. The existing checkout
 * function dispatches to it so the project stays within the
 * current API file count.
 *
 * Job Checkout is created only when HAVKAR_JOB_PAYMENTS_ENABLED
 * is exactly "true". This file never marks an advertisement active.
 * Service Checkout charges the agreed price only. The 10% application
 * fee is taken from the provider settlement. Cash bookings stay closed.
 */
const jobBilling = require("./havkar-job-billing.js");
const serviceCommerce = require("./havkar-service-commerce.js");

const ROUTES = {
  "job-checkout": true,
  "job-billing": true,
  "service-commerce": true
};

function isCommerceRoute(route) {
  return ROUTES[route] === true;
}

function json(res, status, body) {
  return res.status(status).json(body);
}

function configurationReady(env) {
  return Boolean(env.STRIPE_SECRET_KEY && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

async function createOrdinaryCheckout(ctx, user) {
  const jobId = ctx.req.body && ctx.req.body.jobId;
  if (!jobId) {
    return json(ctx.res, 400, { ok: false, error: "Job id is required." });
  }

  const existing = await ctx.supabaseAdmin
    .from("jobs")
    .select("id,user_id,status,plan,employer_kind,title")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing.error) {
    return json(ctx.res, 503, {
      ok: false,
      code: "schema_not_ready",
      error: "The job could not be read. No charge was created."
    });
  }

  const job = existing.data;
  if (!job || job.employer_kind === "company") {
    return json(ctx.res, 404, {
      ok: false,
      error: "That ordinary job advertisement was not found."
    });
  }

  const cents = jobBilling.ordinaryAmountCents(job.plan);
  if (!cents || (job.status !== "pending_payment" && job.status !== "active" && job.status !== "expired")) {
    return json(ctx.res, 409, {
      ok: false,
      error: "This advertisement cannot be sent to payment."
    });
  }

  const origin = ctx.getOrigin(ctx.req);
  const session = await ctx.stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: user.id,
    success_url: origin + "/jobs.html?job_payment=return",
    cancel_url: origin + "/jobs.html?job_payment=cancel",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: cents,
        product_data: {
          name: "HAVKAR job advertisement — " + job.plan + " — 30 days"
        }
      }
    }],
    metadata: {
      havkar_purpose: "job_advertisement",
      job_id: String(job.id),
      user_id: user.id,
      plan: job.plan
    },
    payment_intent_data: {
      metadata: {
        havkar_purpose: "job_advertisement",
        job_id: String(job.id),
        user_id: user.id,
        plan: job.plan
      }
    }
  });

  return json(ctx.res, 200, {
    ok: true,
    url: session.url,
    activated: false
  });
}

async function createCompanySubscription(ctx, user) {
  const body = ctx.req.body || {};
  const plan = jobBilling.companyPlan(body.planCode);
  if (!plan || !body.companyId) {
    return json(ctx.res, 400, { ok: false, error: "A company plan is required." });
  }

  const membership = await ctx.supabaseAdmin
    .from("job_company_members")
    .select("company_id,user_id")
    .eq("company_id", body.companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership.error) {
    return json(ctx.res, 503, {
      ok: false,
      code: "schema_not_ready",
      error: "Company membership could not be verified. No charge was created."
    });
  }

  if (!membership.data) {
    return json(ctx.res, 403, {
      ok: false,
      error: "This subscription can only be started by a member of that company."
    });
  }

  const origin = ctx.getOrigin(ctx.req);
  const session = await ctx.stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: user.id,
    success_url: origin + "/jobs.html?job_subscription=return",
    cancel_url: origin + "/jobs.html?job_subscription=cancel",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: plan.cents,
        recurring: { interval: "month" },
        product_data: {
          name: "HAVKAR company jobs — " + body.planCode
        }
      }
    }],
    metadata: {
      havkar_purpose: "job_subscription",
      company_id: String(body.companyId),
      plan_code: body.planCode,
      user_id: user.id
    },
    subscription_data: {
      metadata: {
        havkar_purpose: "job_subscription",
        company_id: String(body.companyId),
        plan_code: body.planCode
      }
    }
  });

  return json(ctx.res, 200, {
    ok: true,
    url: session.url,
    activated: false
  });
}

async function createServiceCheckout(ctx, user) {
  const body = ctx.req.body || {};
  const bookingId = body.bookingId;
  if (!bookingId) {
    return json(ctx.res, 400, { ok: false, error: "Booking id is required." });
  }

  const bookingResult = await ctx.supabaseAdmin
    .from("service_bookings")
    .select("id,customer_id,provider_id,agreed_price,currency,payment_method,status")
    .eq("id", bookingId)
    .eq("customer_id", user.id)
    .maybeSingle();

  if (bookingResult.error) {
    return json(ctx.res, 503, {
      ok: false,
      code: "schema_not_ready",
      error: "The booking could not be read. No charge was created."
    });
  }

  const booking = bookingResult.data;
  if (!booking || booking.payment_method === "cash") {
    return json(ctx.res, 404, {
      ok: false,
      error: "That online booking was not found. No charge was created."
    });
  }

  const providerResult = await ctx.supabaseAdmin
    .from("service_provider_profiles")
    .select("user_id,verification_status,stripe_account_id")
    .eq("user_id", booking.provider_id)
    .maybeSingle();

  const provider = providerResult.data || {};
  const decision = serviceCommerce.onlineCheckoutDecision(process.env, {
    agreedCents: serviceCommerce.priceToCents(booking.agreed_price),
    connectedAccountId: provider.stripe_account_id || "",
    providerVerified: provider.verification_status === "verified",
    clientCustomerChargeCents: body.customerChargeCents,
    clientCommissionCents: body.commissionCents,
    clientCommissionBps: body.commissionBps
  });

  if (!decision.callStripe) {
    return json(ctx.res, decision.status, {
      ok: false,
      code: decision.code,
      error: decision.error
    });
  }

  const origin = ctx.getOrigin(ctx.req);
  const session = await ctx.stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: user.id,
    success_url: origin + "/services.html?service_payment=return",
    cancel_url: origin + "/services.html?service_payment=cancel",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: String(booking.currency || "eur").toLowerCase(),
        unit_amount: decision.customerChargeCents,
        product_data: {
          name: "HAVKAR service booking"
        }
      }
    }],
    payment_intent_data: {
      application_fee_amount: decision.applicationFeeCents,
      transfer_data: {
        destination: provider.stripe_account_id
      },
      metadata: {
        havkar_purpose: "service_booking",
        booking_id: String(booking.id),
        customer_id: user.id
      }
    },
    metadata: {
      havkar_purpose: "service_booking",
      booking_id: String(booking.id),
      customer_id: user.id
    }
  });

  return json(ctx.res, 200, {
    ok: true,
    url: session.url,
    activated: false,
    customerChargeCents: decision.customerChargeCents,
    applicationFeeCents: decision.applicationFeeCents,
    providerSettlementCents: decision.providerSettlementCents
  });
}

async function requestServiceCompletion(ctx) {
  const env = process.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(ctx.res, 503, serviceCommerce.providerCompletionResponse({
      ok: false,
      code: "completion_not_configured",
      error: "Completion confirmation is not configured. The booking was not marked completed."
    }));
  }

  const auth = await ctx.authenticateUser(ctx.req);
  if (!auth || auth.error || !auth.user) {
    return json(ctx.res, 401, {
      ok: false,
      code: "authentication_required",
      revealCodeToProvider: false,
      completed: false,
      error: "Authentication required. The booking was not marked completed."
    });
  }

  const bookingId = ctx.req.body && ctx.req.body.bookingId;
  if (!bookingId) {
    return json(ctx.res, 400, serviceCommerce.providerCompletionResponse({
      ok: false,
      code: "missing_booking",
      error: "Booking id is required. The booking was not marked completed."
    }));
  }

  const bookingResult = await ctx.supabaseAdmin
    .from("service_bookings")
    .select("id,customer_id,provider_id,status,payment_method")
    .eq("id", bookingId)
    .eq("provider_id", auth.user.id)
    .maybeSingle();

  if (bookingResult.error || !bookingResult.data) {
    return json(ctx.res, bookingResult.error ? 503 : 404, serviceCommerce.providerCompletionResponse({
      ok: false,
      code: bookingResult.error ? "schema_not_ready" : "not_provider",
      error: bookingResult.error
        ? "The booking could not be read. The booking was not marked completed."
        : "That booking was not found for this provider. The booking was not marked completed."
    }));
  }

  const booking = bookingResult.data;
  const decision = serviceCommerce.completionRequestDecision(env, {
    role: "provider",
    userId: auth.user.id,
    bookingId: booking.id,
    bookingProviderId: booking.provider_id,
    bookingCustomerId: booking.customer_id,
    bookingStatus: booking.status
  });
  if (!decision.ok) {
    return json(ctx.res, decision.status, serviceCommerce.providerCompletionResponse(decision));
  }

  const delivery = decision.delivery;
  const inserted = await ctx.supabaseAdmin
    .from("service_completion_codes")
    .insert({
      booking_id: booking.id,
      customer_id: booking.customer_id,
      code_hash: delivery.codeHash,
      expires_at: delivery.expiresAt,
      attempts: 0
    })
    .select("booking_id");

  if (inserted.error && (inserted.error.code === "23505" || /duplicate key/i.test(String(inserted.error.message || "")))) {
    return json(ctx.res, 200, {
      ok: true,
      code: "completion_code_already_sent",
      revealCodeToProvider: false,
      completed: false,
      cashPaid: false,
      error: "A completion code was already sent to the customer. The booking was not marked completed."
    });
  }
  if (inserted.error) {
    return json(ctx.res, 503, serviceCommerce.providerCompletionResponse({
      ok: false,
      code: "schema_not_ready",
      error: "The completion code could not be stored. The booking was not marked completed."
    }));
  }

  const notified = await ctx.supabaseAdmin
    .from("notifications")
    .insert({
      user_id: booking.customer_id,
      type: "service",
      title: "Service completion code",
      message: "Your completion code for booking " + booking.id + " is " + delivery.code + ". Share it only to confirm the visit. This does not accept the quality of the work and does not confirm a cash payment.",
      action_url: "services.html",
      reference_id: String(booking.id)
    })
    .select("id");

  if (notified.error) {
    await ctx.supabaseAdmin.from("service_completion_codes").delete().eq("booking_id", booking.id);
    return json(ctx.res, 502, serviceCommerce.providerCompletionResponse({
      ok: false,
      code: "completion_delivery_failed",
      error: "The completion code was not delivered. The booking was not marked completed."
    }));
  }

  await ctx.supabaseAdmin
    .from("service_bookings")
    .update({ status: "completion_requested" })
    .eq("id", booking.id)
    .eq("provider_id", auth.user.id)
    .eq("status", "accepted")
    .select("id,status");

  return json(ctx.res, 200, serviceCommerce.providerCompletionResponse(decision));
}

async function handleCommerceRoute(ctx) {
  const route = ctx.route;
  const req = ctx.req;
  const res = ctx.res;
  const env = process.env;

  if (req.method !== "POST" && !(route === "job-billing" && req.method === "GET")) {
    res.setHeader("Allow", route === "job-billing" ? "GET, POST" : "POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  if (route === "service-commerce") {
    if (req.body && req.body.action === "cash-booking") {
      const decision = serviceCommerce.cashBookingDecision();
      return json(res, decision.status, {
        ok: false,
        code: decision.code,
        error: decision.error
      });
    }
    if (req.body && req.body.action === "request-completion") {
      return requestServiceCompletion(ctx);
    }
    if (!serviceCommerce.servicePaymentsEnabled(env)) {
      const decision = serviceCommerce.onlineCheckoutDecision(env, {});
      return json(res, decision.status, {
        ok: false,
        code: decision.code,
        error: decision.error
      });
    }
    if (!configurationReady(env)) {
      return json(res, 503, {
        ok: false,
        code: "payments_not_configured",
        error: "Payment server configuration is incomplete. No charge was created."
      });
    }
    const auth = await ctx.authenticateUser(req);
    if (!auth || auth.error || !auth.user) {
      return json(res, 401, {
        ok: false,
        error: (auth && auth.error) || "Authentication required"
      });
    }
    try {
      return await createServiceCheckout(ctx, auth.user);
    } catch (error) {
      console.error("HAVKAR service checkout failed:", error && error.message);
      return json(res, 502, {
        ok: false,
        code: "payment_provider_rejected",
        error: "The payment provider did not start a checkout. Nothing was activated."
      });
    }
  }

  const decision = jobBilling.jobCheckoutDecision(env);
  if (!decision.callStripe) {
    return json(res, decision.status, decision.body);
  }

  if (!configurationReady(env)) {
    return json(res, 503, {
      ok: false,
      code: "payments_not_configured",
      error: "Payment server configuration is incomplete. No charge was created."
    });
  }

  const auth = await ctx.authenticateUser(req);
  if (!auth || auth.error || !auth.user) {
    return json(res, 401, {
      ok: false,
      error: (auth && auth.error) || "Authentication required"
    });
  }

  try {
    if (route === "job-checkout") {
      return await createOrdinaryCheckout(ctx, auth.user);
    }
    if (route === "job-billing" && req.method === "POST") {
      return await createCompanySubscription(ctx, auth.user);
    }
    if (route === "job-billing" && req.method === "GET") {
      return json(res, 200, {
        ok: true,
        failurePolicy: jobBilling.FAILURE_POLICY,
        plans: jobBilling.COMPANY_PLANS
      });
    }
  } catch (error) {
    console.error("HAVKAR commerce route failed:", error && error.message);
    return json(res, 502, {
      ok: false,
      code: "payment_provider_rejected",
      error: "The payment provider did not start a checkout. Nothing was activated."
    });
  }

  return json(res, 404, { ok: false, error: "Unknown commerce route." });
}

module.exports = {
  isCommerceRoute: isCommerceRoute,
  handleCommerceRoute: handleCommerceRoute
};
