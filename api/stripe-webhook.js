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
  processStripeEvent,
  isTestModeTicketEvent
} from "../lib/stripe-webhook-processor.cjs";
import {
  createStripeClient,
  createServiceSupabase,
  configErrorResponse,
  stagingIsolationFailure
} from "../lib/stripe-runtime.cjs";

export const config = {
  api: {
    bodyParser: false
  }
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function createWebhookStore(supabase) {
  return {
    async insertEvent(row) {
      const { error } = await supabase.from("stripe_webhook_events").insert({
        stripe_event_id: row.stripe_event_id,
        event_type: row.event_type,
        livemode: row.livemode,
        object_id: row.object_id,
        received_at: new Date().toISOString()
      });
      if (error) {
        // Unique primary key → duplicate delivery
        if (
          error.code === "23505" ||
          /duplicate|unique/i.test(String(error.message || ""))
        ) {
          return { duplicate: true };
        }
        throw error;
      }
      return { duplicate: false };
    },
    async getTicket(ticketId) {
      const { data, error } = await supabase
        .from("event_tickets")
        .select(
          "id,user_id,event_id,payment_status,ticket_status,payment_reference,ticket_code"
        )
        .eq("id", ticketId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async markTicketPaid({ ticketId, sessionId, paidAt }) {
      const { error } = await supabase
        .from("event_tickets")
        .update({
          payment_status: "paid",
          ticket_status: "valid",
          payment_provider: "stripe",
          payment_reference: sessionId,
          paid_at: paidAt
        })
        .eq("id", ticketId)
        .eq("payment_status", "pending");
      if (error) throw error;
    },
    async markTicketFailed({ ticketId, reason, at }) {
      const { error } = await supabase
        .from("event_tickets")
        .update({
          payment_status: "failed",
          ticket_status: "cancelled",
          cancelled_at: at,
          cancel_reason: reason
        })
        .eq("id", ticketId)
        .in("payment_status", ["pending"]);
      if (error) throw error;
    },
    async updateTicketSettlement(ticketId, patch) {
      const { error } = await supabase
        .from("event_tickets")
        .update(patch)
        .eq("id", ticketId)
        .in("payment_status", ["paid", "disputed"]);
      if (error) throw error;
    },
    async recordPayoutEvent(row) {
      const { error } = await supabase.from("stripe_payout_events").insert({
        stripe_event_id: row.stripe_event_id,
        event_type: row.event_type,
        payout_id: row.payout_id,
        livemode: row.livemode,
        status: row.status || null,
        amount: row.amount == null ? null : Number(row.amount),
        currency: row.currency || null,
        received_at: row.received_at
      });
      if (error) {
        if (
          error.code === "23505" ||
          /duplicate|unique/i.test(String(error.message || ""))
        ) {
          return { duplicate: true };
        }
        // Table may not exist until migration applied — log and continue.
        console.error("stripe_payout_events insert skipped:", error.message);
        return { duplicate: false, skipped: true };
      }
      return { duplicate: false };
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const isolation = stagingIsolationFailure(process.env);
  if (isolation) {
    console.error("HAVKAR Stripe webhook isolation block:", isolation.error);
    return configErrorResponse(res, isolation.error);
  }

  const stripeRuntime = createStripeClient(process.env);
  if (!stripeRuntime.ok || !stripeRuntime.client) {
    console.error(
      "HAVKAR Stripe webhook config:",
      stripeRuntime.reason || "stripe_client_unavailable"
    );
    return configErrorResponse(
      res,
      stripeRuntime.reason || "stripe_client_unavailable"
    );
  }
  const stripe = stripeRuntime.client;

  const stripeSignature = req.headers["stripe-signature"];

  if (!stripeSignature) {
    if (!cardPaymentsAllowed()) {
      return res.status(403).json({
        ok: false,
        error: REAL_PAYMENTS_PAUSED_MESSAGE,
        code: REAL_PAYMENTS_PAUSED_CODE
      });
    }
    return res.status(400).json({ error: "Missing Stripe signature" });
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (_error) {
    return res.status(400).json({ error: "Could not read webhook body" });
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
      const result = await processAdsBoostEvent(adsBoost.event, process.env);
      return res.status(200).json(result);
    } catch (error) {
      console.error("HAVKAR Ads boost webhook processing error:", error);
      return res.status(500).json({ error: "Ads boost webhook processing failed" });
    }
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return configErrorResponse(res, "STRIPE_WEBHOOK_SECRET missing");
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
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  // Fail closed: livemode events must never mutate staging DB via Preview.
  if (
    event.livemode === true &&
    (process.env.VERCEL_ENV === "preview" ||
      String(process.env.SUPABASE_URL || "").includes("keglioewbkgdabsizvys"))
  ) {
    console.error("HAVKAR refused livemode Stripe event on staging/preview");
    return res.status(403).json({
      ok: false,
      code: "LIVE_EVENT_REFUSED_ON_STAGING",
      error: "Live Stripe events are refused on staging"
    });
  }

  const supabaseRuntime = createServiceSupabase(process.env);
  if (!supabaseRuntime.ok || !supabaseRuntime.client) {
    console.error(
      "HAVKAR Stripe webhook Supabase config:",
      supabaseRuntime.reason || "supabase_unavailable"
    );
    return configErrorResponse(
      res,
      supabaseRuntime.reason || "supabase_unavailable"
    );
  }

  /*
   * While public collection is paused, still process signed Stripe events
   * for reconciliation (test-mode tickets, refunds, disputes, payouts).
   * Creating new live Checkout Sessions remains gated elsewhere.
   */
  if (
    !cardPaymentsAllowed() &&
    event.livemode === true &&
    !isTestModeTicketEvent(event) &&
    event.type === "checkout.session.completed" &&
    event.data?.object?.metadata?.havkar_flow === "marketplace"
  ) {
    // Marketplace live sessions must not fulfill while master flags are off.
    return res.status(403).json({
      ok: false,
      error: REAL_PAYMENTS_PAUSED_MESSAGE,
      code: REAL_PAYMENTS_PAUSED_CODE,
      received_event: event.type
    });
  }

  try {
    if (
      event.type === "checkout.session.completed" &&
      event.data?.object?.metadata?.havkar_flow === "ad_boost" &&
      event.data?.object?.metadata?.test_mode === "true"
    ) {
      const result = await processAdsBoostEvent(event, process.env);
      return res.status(200).json(result);
    }

    const result = await processStripeEvent(
      event,
      createWebhookStore(supabaseRuntime.client),
      { stripe }
    );
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    console.error("HAVKAR Stripe webhook processing error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}
