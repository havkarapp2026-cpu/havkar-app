/*
 * Shared route handler for job and service payment endpoints.
 * It is not a Vercel function by itself. The existing checkout
 * function dispatches to it so the project stays within the
 * current API file count.
 *
 * Job Checkout is created only when HAVKAR_JOB_PAYMENTS_ENABLED
 * is exactly "true". This file never marks an advertisement active.
 * Service charges stay closed in this version: the webhook does not
 * yet settle a Connect transfer, and cash commission is not guaranteed.
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
    const decision = serviceCommerce.onlineCheckoutDecision(env, {});
    return json(res, decision.callStripe ? 503 : decision.status, {
      ok: false,
      code: decision.callStripe ? "service_settlement_not_ready" : decision.code,
      error: decision.callStripe
        ? "Service checkout stays closed until Connect settlement is approved. No charge was created."
        : decision.error
    });
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
