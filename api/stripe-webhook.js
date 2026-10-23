import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

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
