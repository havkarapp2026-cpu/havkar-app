import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import {
  cardPaymentsAllowed,
  REAL_PAYMENTS_PAUSED_CODE,
  REAL_PAYMENTS_PAUSED_MESSAGE
} from "../lib/real-payments.cjs";
import {
  tryConstructAdsBoostEvent,
  processAdsBoostEvent
} from "../lib/ad-boost-webhook.cjs";
import {
  ticketIdFromMetadata,
  settlementActionForEvent,
  ticketUpdateFromSettlement,
  isDuplicatePaidActivation
} from "../lib/stripe-ticket-settlement.cjs";

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
    if (!cardPaymentsAllowed()) {
      return res.status(403).json({
        ok: false,
        error: REAL_PAYMENTS_PAUSED_MESSAGE,
        code: REAL_PAYMENTS_PAUSED_CODE
      });
    }

    return res.status(400).json({
      error: "Missing Stripe signature",
    });
  }

  let rawBody;

  try {
    rawBody = await getRawBody(req);
  } catch (error) {
    return res.status(400).json({
      error: "Could not read webhook body",
    });
  }

  /*
   * Ads boost TEST MODE is prepared on this same function so Hobby
   * stays within the 12-function limit. It must run even while real
   * card payments remain paused.
   */
  const adsBoost = await tryConstructAdsBoostEvent(
    rawBody,
    stripeSignature,
    process.env
  );

  if (adsBoost.handled && adsBoost.event) {
    try {
      const result = await processAdsBoostEvent(
        adsBoost.event,
        process.env
      );
      return res.status(200).json(result);
    } catch (error) {
      console.error(
        "HAVKAR Ads boost webhook processing error:",
        error
      );
      return res.status(500).json({
        error: "Ads boost webhook processing failed",
      });
    }
  }

  if (!cardPaymentsAllowed()) {
    return res.status(403).json({
      ok: false,
      error: REAL_PAYMENTS_PAUSED_MESSAGE,
      code: REAL_PAYMENTS_PAUSED_CODE
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

      if (
        session.metadata?.havkar_flow === "ad_boost" &&
        session.metadata?.test_mode === "true"
      ) {
        const result = await processAdsBoostEvent(event, process.env);
        return res.status(200).json(result);
      }

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
      if (isDuplicatePaidActivation(existingTicket, session.id)) {
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

    /*
     * Settlement events. Live Dashboard must subscribe these (MCP write denied).
     * Refund/dispute update ticket rows by event_ticket_id metadata when present.
     */
    if (
      event.type === "charge.refunded" ||
      event.type === "charge.dispute.created" ||
      event.type === "charge.dispute.closed" ||
      event.type === "payout.paid" ||
      event.type === "payout.failed"
    ) {
      const action = settlementActionForEvent(event.type);
      const chargeOrObject = event.data && event.data.object;
      let ticketId = ticketIdFromMetadata(
        chargeOrObject && chargeOrObject.metadata
      );

      // Checkout stores event_ticket_id on PaymentIntent metadata; Charge may omit it.
      if (
        !ticketId &&
        chargeOrObject &&
        typeof chargeOrObject.payment_intent === "string" &&
        chargeOrObject.payment_intent.startsWith("pi_")
      ) {
        try {
          const intent = await stripe.paymentIntents.retrieve(
            chargeOrObject.payment_intent
          );
          ticketId = ticketIdFromMetadata(intent && intent.metadata);
        } catch (lookupError) {
          console.error(
            "HAVKAR could not load PaymentIntent metadata for settlement:",
            lookupError && lookupError.message
          );
        }
      }

      const patch = ticketUpdateFromSettlement(
        action,
        new Date().toISOString()
      );

      if (ticketId && patch) {
        const { error: settlementError } = await supabase
          .from("event_tickets")
          .update(patch)
          .eq("id", ticketId)
          .in("payment_status", ["paid", "disputed"]);

        if (settlementError) {
          throw settlementError;
        }

        console.log(
          "HAVKAR ticket settlement applied:",
          event.type,
          ticketId
        );

        return res.status(200).json({
          received: true,
          settlement_event: event.type,
          ticket_id: ticketId,
          applied: true
        });
      }

      console.log(
        "HAVKAR Stripe settlement event acknowledged:",
        event.type,
        event.id,
        ticketId ? "ticket_metadata_present_but_no_patch" : "no_ticket_metadata"
      );
      return res.status(200).json({
        received: true,
        settlement_event: event.type,
        applied: false
      });
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
