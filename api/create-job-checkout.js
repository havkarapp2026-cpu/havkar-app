import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { checkoutReuseAction, planForStoredJob } from "../lib/job-publication.mjs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

function sendError(res, status, message) {
  return res.status(status).json({
    ok: false,
    error: message,
  });
}

function getOrigin(req) {
  const configuredOrigin = process.env.HAVKAR_APP_URL?.trim();

  if (configuredOrigin) {
    return configuredOrigin.replace(/\/+$/, "");
  }

  const forwardedHost = req.headers["x-forwarded-host"];
  const host =
    typeof forwardedHost === "string" && forwardedHost
      ? forwardedHost
      : req.headers.host;

  if (!host) {
    return "https://havkar-app.vercel.app";
  }

  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol =
    typeof forwardedProto === "string" && forwardedProto
      ? forwardedProto.split(",")[0].trim()
      : "https";

  return `${protocol}://${host}`;
}

async function authenticateUser(req) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return { user: null, error: "Authentication required" };
  }

  const accessToken = authorization.slice(7).trim();

  if (!accessToken) {
    return { user: null, error: "Authentication required" };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !data?.user) {
    return { user: null, error: "Invalid or expired session" };
  }

  return { user: data.user, error: null };
}

function checkoutPayload(job, user, origin) {
  const plan = planForStoredJob(job.plan, job.monthly_fee);

  return {
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: user.email || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: plan.cents,
          product_data: {
            name: `HAVKAR job publication — ${job.plan}`,
            description: "One-time HAVKAR job publication charge",
          },
        },
      },
    ],
    metadata: {
      purpose: "job_publication",
      job_id: String(job.id),
      havkar_user_id: String(user.id),
      plan: String(job.plan),
    },
    payment_intent_data: {
      metadata: {
        purpose: "job_publication",
        job_id: String(job.id),
        havkar_user_id: String(user.id),
        plan: String(job.plan),
      },
    },
    success_url:
      `${origin}/jobs.html?payment=return&job_id=${encodeURIComponent(job.id)}`,
    cancel_url:
      `${origin}/jobs.html?payment=cancelled&job_id=${encodeURIComponent(job.id)}`,
  };
}

async function createOrReuseSession(job, user, origin) {
  const payload = checkoutPayload(job, user, origin);
  let idempotencyKey = `job-publication-${job.id}`;
  let session = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const created = await stripe.checkout.sessions.create(payload, {
      idempotencyKey: idempotencyKey,
    });
    session = await stripe.checkout.sessions.retrieve(created.id);

    const action = checkoutReuseAction(session);

    if (action === "reuse" || action === "confirm") {
      return session;
    }

    idempotencyKey = `job-publication-${job.id}-after-${session.id}`;
  }

  return session;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendError(res, 405, "Method not allowed");
  }

  if (
    !process.env.STRIPE_SECRET_KEY ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.error("Missing required server environment variables");
    return sendError(res, 500, "Server configuration error");
  }

  try {
    const { user, error: authError } = await authenticateUser(req);

    if (authError || !user) {
      return sendError(res, 401, authError || "Authentication required");
    }

    const jobId = Number(req.body?.job_id);

    if (!Number.isSafeInteger(jobId) || jobId <= 0) {
      return sendError(res, 400, "Invalid job");
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from("jobs")
      .select("id,user_id,status,plan,monthly_fee")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) {
      throw jobError;
    }

    if (!job || String(job.user_id) !== String(user.id)) {
      return sendError(res, 404, "Job not found");
    }

    if (job.status === "active") {
      return sendError(res, 409, "This job is already active");
    }

    if (job.status !== "pending_payment") {
      return sendError(res, 409, "This job cannot be published");
    }

    if (!planForStoredJob(job.plan, job.monthly_fee)) {
      console.error("Job plan price does not match the publication catalog", job.id);
      return sendError(res, 409, "This job does not have a payable publication plan");
    }

    const session = await createOrReuseSession(job, user, getOrigin(req));
    const action = checkoutReuseAction(session);

    if (action === "confirm") {
      return res.status(200).json({
        ok: true,
        pending_confirmation: true,
      });
    }

    if (action !== "reuse") {
      console.error("Job checkout session cannot be reused", job.id, session && session.status);
      return sendError(res, 409, "The payment could not be started");
    }

    return res.status(200).json({
      ok: true,
      pending_confirmation: false,
      checkout_url: session.url,
    });
  } catch (error) {
    console.error("HAVKAR create-job-checkout error:", error);

    return sendError(res, 500, "Unable to create checkout");
  }
}
