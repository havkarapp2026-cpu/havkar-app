import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { assessPaidJobSession } from "../lib/job-publication.mjs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(
      typeof chunk === "string"
        ? Buffer.from(chunk)
        : chunk
    );
  }

  return Buffer.concat(chunks);
}

function paymentIntentId(session) {
  if (!session || !session.payment_intent) {
    return "";
  }

  if (typeof session.payment_intent === "string") {
    return session.payment_intent;
  }

  return String(session.payment_intent.id || "");
}

async function refundUnfulfilledJobCharge(session) {
  const intentId = paymentIntentId(session);

  if (!intentId.startsWith("pi_")) {
    throw new Error("Paid job session has no payment intent to refund");
  }

  await stripe.refunds.create(
    {
      payment_intent: intentId,
    },
    {
      idempotencyKey: `job-publication-refund-${session.id}`,
    }
  );
}

async function confirmJobPublication(event) {
  const eventSession = event.data?.object;
  const sessionId = String(eventSession?.id || "");

  if (!sessionId.startsWith("cs_") || !String(event.id || "").startsWith("evt_")) {
    console.error("Job publication webhook is missing a Stripe reference");

    return {
      status: 200,
      body: { received: true, ignored: true },
    };
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const assessed = assessPaidJobSession(session);

  if (!assessed.ok) {
    console.error(
      "Verified job Checkout Session was not fulfilled:",
      sessionId,
      assessed.reason
    );

    const refundable = [
      "amount",
      "currency",
      "plan",
      "job",
      "user",
      "mode",
      "session",
    ];

    if (
      session.payment_status === "paid" &&
      refundable.includes(assessed.reason)
    ) {
      await refundUnfulfilledJobCharge(session);
    }

    return {
      status: 200,
      body: { received: true, ignored: true },
    };
  }

  const { data, error } = await supabase.rpc("publish_paid_job", {
    p_job_id: assessed.jobId,
    p_user_id: assessed.userId,
    p_plan: assessed.plan,
    p_amount: assessed.amount,
    p_currency: assessed.currency,
    p_checkout_session_id: assessed.sessionId,
    p_event_id: event.id,
  });

  if (error) {
    if (error.code === "42501" || error.code === "P0002") {
      console.error(
        "Paid job could not be published:",
        assessed.jobId,
        error.code
      );
      await refundUnfulfilledJobCharge(session);

      return {
        status: 200,
        body: { received: true, refunded: true },
      };
    }

    if (error.code === "23505" || error.code === "22023") {
      console.error(
        "Job publication reference was rejected:",
        assessed.jobId,
        error.code
      );

      return {
        status: 200,
        body: { received: true },
      };
    }

    throw error;
  }

  if (data === "duplicate" || data === "published") {
    return {
      status: 200,
      body: { received: true, result: data },
    };
  }

  if (data === "already_active") {
    console.error(
      "Job was already active for a different charge:",
      assessed.jobId
    );
    await refundUnfulfilledJobCharge(session);

    return {
      status: 200,
      body: { received: true, refunded: true },
    };
  }

  throw new Error("Unexpected job publication result");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const stripeSignature = req.headers["stripe-signature"];

  if (!stripeSignature) {
    return res.status(400).json({
      error: "Missing Stripe signature",
    });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");

    return res.status(500).json({
      error: "Webhook configuration error",
    });
  }

  let event;

  try {
    const rawBody = await getRawBody(req);

    event = stripe.webhooks.constructEvent(
      rawBody,
      stripeSignature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error(
      "Stripe webhook signature verification failed:",
      error.message
    );

    return res.status(400).json({
      error: "Invalid webhook signature",
    });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const ticketId = session.metadata?.event_ticket_id;

      if (session.metadata?.purpose === "job_publication" && !ticketId) {
        const result = await confirmJobPublication(event);

        return res.status(result.status).json(result.body);
      }

      if (!ticketId) {
        console.error(
          "checkout.session.completed has no event_ticket_id metadata",
          session.id
        );

        return res.status(200).json({
          received: true,
        });
      }

      /*
       * For paid Checkout Sessions, only activate the ticket
       * after Stripe reports that the payment is actually paid.
       *
       * Free tickets should be issued by the server-side
       * ticket creation endpoint, not by this webhook.
       */
      if (session.payment_status !== "paid") {
        console.log(
          "Checkout Session completed but payment is not paid:",
          session.id,
          session.payment_status
        );

        return res.status(200).json({
          received: true,
        });
      }

      const paidAt = new Date().toISOString();

      const { data: existingTicket, error: findError } =
        await supabase
          .from("event_tickets")
          .select(
            "id,user_id,event_id,payment_status,ticket_status,payment_reference"
          )
          .eq("id", ticketId)
          .maybeSingle();

      if (findError) {
        throw findError;
      }

      if (!existingTicket) {
        console.error(
          "Event ticket not found:",
          ticketId
        );

        return res.status(200).json({
          received: true,
        });
      }

      /*
       * Stripe may deliver the same webhook more than once.
       * If this ticket was already activated by this Checkout
       * Session, no second update is necessary.
       */
      if (
        existingTicket.payment_status === "paid" &&
        existingTicket.ticket_status === "valid" &&
        existingTicket.payment_reference === session.id
      ) {
        return res.status(200).json({
          received: true,
          duplicate: true,
        });
      }

      const { error: updateError } = await supabase
        .from("event_tickets")
        .update({
          payment_status: "paid",
          ticket_status: "valid",
          payment_provider: "stripe",
          payment_reference: session.id,
          paid_at: paidAt,
        })
        .eq("id", ticketId)
        .eq("payment_status", "pending");

      if (updateError) {
        throw updateError;
      }

      console.log(
        "HAVKAR event ticket payment confirmed:",
        ticketId,
        session.id
      );
    }

    return res.status(200).json({
      received: true,
    });
  } catch (error) {
    console.error(
      "HAVKAR Stripe webhook processing error:",
      error
    );

    return res.status(500).json({
      error: "Webhook processing failed",
    });
  }
}
