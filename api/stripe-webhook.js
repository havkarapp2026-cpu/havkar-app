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
import {
  buildMarketplaceCardOrderFromSession
} from "../lib/marketplace-card-orders.cjs";
import serviceCommerce from "../havkar-service-commerce.js";
import jobBilling from "../havkar-job-billing.js";

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

async function upsertMarketplaceCardOrderBestEffort({
  supabase,
  session,
  sessionId,
  listingId,
  buyerUserId,
  sellerUserId,
  listingTitle,
  paidAt
}) {
  try {
    const built = buildMarketplaceCardOrderFromSession(
      session || {
        id: sessionId,
        amount_total: null,
        currency: "eur",
        metadata: {
          havkar_flow: "marketplace",
          listing_id: String(listingId),
          havkar_user_id: buyerUserId || "",
          seller_id: sellerUserId || ""
        }
      },
      {
        listingId,
        sessionId,
        buyerUserId,
        sellerUserId,
        listingTitle,
        paidAt
      }
    );
    if (!built.ok || !built.row) {
      return { ok: false, reason: built.reason || "build_failed" };
    }
    const row = built.row;
    const matchKey = row.stripe_session_id
      ? { stripe_session_id: row.stripe_session_id }
      : row.stripe_payment_intent
        ? { stripe_payment_intent: row.stripe_payment_intent }
        : null;
    if (matchKey) {
      const { data: existing } = await supabase
        .from("marketplace_card_orders")
        .select("id")
        .match(matchKey)
        .maybeSingle();
      if (existing && existing.id) {
        const { data: updated, error: updateError } = await supabase
          .from("marketplace_card_orders")
          .update({
            ...row,
            updated_at: new Date().toISOString()
          })
          .eq("id", existing.id)
          .select("id")
          .maybeSingle();
        if (updateError) throw updateError;
        return { ok: true, id: updated && updated.id, updated: true };
      }
    }
    const { data: inserted, error: insertError } = await supabase
      .from("marketplace_card_orders")
      .insert(row)
      .select("id")
      .maybeSingle();
    if (insertError) {
      if (
        insertError.code === "23505" ||
        /duplicate|unique/i.test(String(insertError.message || ""))
      ) {
        return { ok: true, duplicate: true };
      }
      throw insertError;
    }
    return { ok: true, id: inserted && inserted.id, inserted: true };
  } catch (error) {
    console.error(
      "marketplace_card_orders upsert skipped:",
      error && error.message
    );
    return {
      ok: false,
      skipped: true,
      error: error && error.message ? error.message : "upsert_failed"
    };
  }
}

function createWebhookStore(supabase, stripe) {
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
    },
    async updateConnectAccount(row) {
      const patch = {
        charges_enabled: row.charges_enabled === true,
        payouts_enabled: row.payouts_enabled === true,
        details_submitted: row.details_submitted === true,
        onboarding_status: row.onboarding_status || "pending",
        updated_at: row.updated_at || new Date().toISOString()
      };
      const { data, error } = await supabase
        .from("marketplace_seller_connect_accounts")
        .update(patch)
        .eq("stripe_account_id", row.stripe_account_id)
        .select("stripe_account_id")
        .maybeSingle();
      if (error) {
        console.error(
          "marketplace_seller_connect_accounts update skipped:",
          error.message
        );
        return { updated: false, skipped: true };
      }
      return { updated: Boolean(data && data.stripe_account_id) };
    },
    async fulfillMarketplaceListing({
      listingId,
      sessionId,
      session,
      buyerUserId,
      sellerUserId,
      paidAt
    }) {
      const { data: existing, error: loadError } = await supabase
        .from("ads")
        .select("id,status,user_id,listing_surface,title")
        .eq("id", listingId)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!existing) {
        return { applied: false, reason: "listing_not_found" };
      }
      if (String(existing.status) === "ended") {
        /* Still ensure order history row exists for already-ended paid listings. */
        await upsertMarketplaceCardOrderBestEffort({
          supabase,
          session,
          sessionId,
          listingId,
          buyerUserId,
          sellerUserId: sellerUserId || existing.user_id,
          listingTitle: existing.title,
          paidAt
        });
        return {
          applied: false,
          duplicate: true,
          reason: "already_ended",
          listing_id: listingId,
          session_id: sessionId
        };
      }
      const prior = String(existing.status || "");
      if (prior !== "active" && prior !== "reserved") {
        return {
          applied: false,
          reason: "listing_not_purchasable",
          status: existing.status
        };
      }
      let query = supabase
        .from("ads")
        .update({ status: "ended" })
        .eq("id", listingId)
        .in("status", ["active", "reserved"]);
      if (existing.listing_surface) {
        query = query.eq("listing_surface", existing.listing_surface);
      }
      const { data: updated, error: updateError } = await query
        .select("id,status")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated || String(updated.status) !== "ended") {
        return {
          applied: false,
          reason: "listing_end_failed",
          listing_id: listingId
        };
      }
      try {
        await supabase.from("ad_audit_events").insert({
          ad_id: listingId,
          actor_id: buyerUserId || null,
          action: "marketplace_card_paid",
          meta: {
            stripe_session_id: sessionId,
            paid_at: paidAt || null,
            previous_status: prior,
            source: "stripe_webhook"
          }
        });
      } catch (_auditErr) {
        // Audit insert is best-effort; Stripe payment already settled.
      }
      const orderResult = await upsertMarketplaceCardOrderBestEffort({
        supabase,
        session,
        sessionId,
        listingId,
        buyerUserId,
        sellerUserId: sellerUserId || existing.user_id,
        listingTitle: existing.title,
        paidAt
      });
      return {
        applied: true,
        fulfillment: "marketplace_listing_ended",
        listing_id: listingId,
        session_id: sessionId,
        previous_status: prior,
        order_registered: Boolean(orderResult && orderResult.ok),
        order_id: orderResult && orderResult.id ? orderResult.id : null
      };
    },
    async releaseMarketplaceReservation({
      listingId,
      sessionId,
      reason
    }) {
      const { data: existing, error: loadError } = await supabase
        .from("ads")
        .select("id,status,listing_surface")
        .eq("id", listingId)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!existing) {
        return { applied: false, reason: "listing_not_found" };
      }
      if (String(existing.status) !== "reserved") {
        return {
          applied: false,
          reason: "listing_not_reserved",
          status: existing.status,
          listing_id: listingId,
          session_id: sessionId || null
        };
      }
      let query = supabase
        .from("ads")
        .update({ status: "active" })
        .eq("id", listingId)
        .eq("status", "reserved");
      if (existing.listing_surface) {
        query = query.eq("listing_surface", existing.listing_surface);
      }
      const { data: updated, error: updateError } = await query
        .select("id,status")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated || String(updated.status) !== "active") {
        return {
          applied: false,
          reason: "listing_release_failed",
          listing_id: listingId
        };
      }
      try {
        await supabase.from("ad_audit_events").insert({
          ad_id: listingId,
          actor_id: null,
          action: "marketplace_checkout_released",
          meta: {
            stripe_session_id: sessionId || null,
            release_reason: reason || "checkout_expired",
            source: "stripe_webhook"
          }
        });
      } catch (_auditErr) {
        // Audit is best-effort.
      }
      return {
        applied: true,
        fulfillment: "marketplace_reservation_released",
        listing_id: listingId,
        session_id: sessionId || null
      };
    },
    async settleServiceCharge({ event, chargeOrObject, stripeClient, nowIso }) {
      const meta = (chargeOrObject && chargeOrObject.metadata) || {};
      let bookingId = Number(meta.booking_id);
      if (
        (!Number.isSafeInteger(bookingId) || bookingId <= 0) &&
        chargeOrObject &&
        typeof chargeOrObject.payment_intent === "string" &&
        stripeClient
      ) {
        try {
          const intent = await stripeClient.paymentIntents.retrieve(
            chargeOrObject.payment_intent
          );
          bookingId = Number(
            (intent && intent.metadata && intent.metadata.booking_id) || 0
          );
          if (String((intent && intent.metadata && intent.metadata.havkar_flow) || "") !== "services") {
            return { ok: true, applied: false, reason: "not_services_pi" };
          }
        } catch (_err) {
          bookingId = 0;
        }
      } else if (String(meta.havkar_flow || "") !== "services") {
        /* Also accept lookup by stored charge/payment intent on bookings. */
        if (chargeOrObject && chargeOrObject.id) {
          const { data: byCharge } = await supabase
            .from("service_bookings")
            .select("id")
            .eq("stripe_charge_id", chargeOrObject.id)
            .maybeSingle();
          if (byCharge && byCharge.id) bookingId = Number(byCharge.id);
        }
        if (
          (!Number.isSafeInteger(bookingId) || bookingId <= 0) &&
          chargeOrObject &&
          chargeOrObject.payment_intent
        ) {
          const { data: byPi } = await supabase
            .from("service_bookings")
            .select("id")
            .eq(
              "stripe_payment_intent",
              typeof chargeOrObject.payment_intent === "string"
                ? chargeOrObject.payment_intent
                : chargeOrObject.payment_intent.id
            )
            .maybeSingle();
          if (byPi && byPi.id) bookingId = Number(byPi.id);
        }
      }
      if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
        return { ok: true, applied: false, reason: "not_services_charge" };
      }
      return serviceCommerce.applyServiceChargeSettlement({
        supabase,
        event,
        chargeOrObject,
        bookingId,
        nowIso
      });
    },
    async fulfillServiceBookingPayment({ event, session }) {
      const meta = (session && session.metadata) || {};
      if (String(meta.havkar_flow || "") !== "services") {
        return { applied: false, reason: "not_services_flow" };
      }
      let verifiedApplicationFeeCents = null;
      let verifiedTransferDestination =
        meta.connected_account_id || null;
      let paymentIntent = session && session.payment_intent;
      try {
        if (
          stripe &&
          typeof paymentIntent === "string" &&
          paymentIntent.startsWith("pi_")
        ) {
          paymentIntent = await stripe.paymentIntents.retrieve(paymentIntent);
        }
        if (paymentIntent && typeof paymentIntent === "object") {
          if (paymentIntent.application_fee_amount != null) {
            verifiedApplicationFeeCents = Number(
              paymentIntent.application_fee_amount
            );
          }
          if (
            paymentIntent.transfer_data &&
            paymentIntent.transfer_data.destination
          ) {
            verifiedTransferDestination =
              paymentIntent.transfer_data.destination;
          }
        }
      } catch (_err) {
        /* fall through to metadata fee */
      }
      if (
        verifiedApplicationFeeCents == null &&
        meta.application_fee_cents != null
      ) {
        verifiedApplicationFeeCents = Number(meta.application_fee_cents);
      }
      const sessionForSettle = Object.assign({}, session, {
        payment_intent: paymentIntent || session.payment_intent
      });
      const result = await serviceCommerce.applyVerifiedServicePayment({
        supabase,
        event,
        session: sessionForSettle,
        verifiedApplicationFeeCents,
        verifiedTransferDestination
      });
      return Object.assign(
        {
          applied: Boolean(result && result.ok),
          fulfillment: "services_booking_payment"
        },
        result || {}
      );
    },
    async settleMarketplaceCharge({
      listingId,
      eventType,
      outcome,
      nextStatus,
      chargeId,
      paymentIntentId,
      amount,
      currency,
      at
    }) {
      const { data: existing, error: loadError } = await supabase
        .from("ads")
        .select("id,status,listing_surface")
        .eq("id", listingId)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!existing) {
        return { applied: false, reason: "listing_not_found" };
      }
      let statusChanged = false;
      if (
        nextStatus &&
        String(existing.status || "") !== String(nextStatus) &&
        (String(existing.status) === "ended" ||
          String(existing.status) === "disputed" ||
          String(existing.status) === "refunded" ||
          String(existing.status) === "reserved" ||
          String(existing.status) === "active")
      ) {
        const { data: updated, error: updateError } = await supabase
          .from("ads")
          .update({ status: nextStatus })
          .eq("id", listingId)
          .select("id,status")
          .maybeSingle();
        if (updateError) throw updateError;
        statusChanged = Boolean(
          updated && String(updated.status) === String(nextStatus)
        );
      }
      try {
        await supabase.from("ad_audit_events").insert({
          ad_id: listingId,
          actor_id: null,
          action: outcome || "marketplace_charge_event",
          meta: {
            stripe_event_type: eventType || null,
            stripe_charge_id: chargeId || null,
            stripe_payment_intent: paymentIntentId || null,
            amount: amount == null ? null : Number(amount),
            currency: currency || null,
            next_status: nextStatus || null,
            previous_status: existing.status || null,
            status_changed: statusChanged,
            at: at || null,
            source: "stripe_webhook"
          }
        });
      } catch (_auditErr) {
        // Audit is best-effort after Stripe already settled the charge event.
      }
      if (nextStatus === "refunded" || nextStatus === "disputed") {
        try {
          const patch = {
            status: nextStatus,
            updated_at: at || new Date().toISOString()
          };
          if (chargeId) patch.stripe_charge_id = chargeId;
          if (paymentIntentId) patch.stripe_payment_intent = paymentIntentId;
          let orderQuery = supabase
            .from("marketplace_card_orders")
            .update(patch)
            .eq("ad_id", listingId)
            .eq("status", "paid");
          if (paymentIntentId) {
            orderQuery = orderQuery.eq(
              "stripe_payment_intent",
              paymentIntentId
            );
          } else if (chargeId) {
            orderQuery = orderQuery.eq("stripe_charge_id", chargeId);
          }
          await orderQuery;
        } catch (orderErr) {
          console.error(
            "marketplace_card_orders settle update skipped:",
            orderErr && orderErr.message
          );
        }
      }
      return {
        applied: true,
        status_changed: statusChanged,
        listing_id: listingId,
        outcome: outcome || null
      };
    },
    async postFinanceJournal(built) {
      const {
        postJournalEntry
      } = require("../lib/havkar-finance-ledger.cjs");
      try {
        return await postJournalEntry(supabase, built);
      } catch (error) {
        console.error("havkar finance journal post skipped:", error.message);
        return { ok: false, skipped: true, error: error.message };
      }
    },
    async nextFinanceDocumentSequence(kind) {
      const { count, error } = await supabase
        .from("havkar_finance_documents")
        .select("id", { count: "exact", head: true })
        .eq("document_kind", kind || "payment_receipt");
      if (error) {
        return Date.now() % 1000000;
      }
      return Number(count || 0) + 1;
    },
    async insertFinanceDocument(doc) {
      const { error } = await supabase.from("havkar_finance_documents").insert(doc);
      if (error) {
        if (
          error.code === "23505" ||
          /duplicate|unique/i.test(String(error.message || ""))
        ) {
          return { duplicate: true };
        }
        console.error("havkar_finance_documents insert skipped:", error.message);
        return { skipped: true, error: error.message };
      }
      return { ok: true };
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

    /* Ordinary Jobs prepaid Checkout + subscription billing events. */
    if (jobBilling.isJobBillingEvent(event)) {
      if (
        !cardPaymentsAllowed() &&
        event.livemode === true &&
        event.type === "checkout.session.completed"
      ) {
        return res.status(403).json({
          ok: false,
          error: REAL_PAYMENTS_PAUSED_MESSAGE,
          code: REAL_PAYMENTS_PAUSED_CODE,
          received_event: event.type
        });
      }
      if (
        String(process.env.HAVKAR_JOB_PAYMENTS_ENABLED || "") !== "true" &&
        event.type === "checkout.session.completed" &&
        event.livemode === true
      ) {
        return res.status(403).json({
          ok: false,
          code: "JOBS_PAYMENTS_OFF",
          error: "Jobs live payments are not armed.",
          received_event: event.type
        });
      }
      let jobOutcome = null;
      if (event.type === "checkout.session.completed") {
        jobOutcome = await jobBilling.applyVerifiedCheckoutSession({
          supabase: supabaseRuntime.client,
          event: event,
          session: event.data.object
        });
      } else {
        jobOutcome = await jobBilling.applyVerifiedBillingEvent({
          supabase: supabaseRuntime.client,
          event: event
        });
      }
      return res.status(200).json({
        received: true,
        jobs_billing: true,
        ...jobOutcome
      });
    }

    let financeGates = null;
    try {
      const gates = await supabaseRuntime.client
        .from("havkar_finance_issuance_gates")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      financeGates = gates.data || null;
    } catch (_gatesError) {
      financeGates = null;
    }

    const result = await processStripeEvent(
      event,
      createWebhookStore(
        supabaseRuntime.client,
        stripeRuntime && stripeRuntime.client ? stripeRuntime.client : null
      ),
      {
        stripe,
        financeGates,
        operator: {
          legalEntityName: "HAVKAR DI JALILNIA AMIR",
          registeredAddress:
            "Francesco Antonio Lucifero 40, 88900 Crotone, Italy",
          reaNumber: "KR-234170",
          partitaIva: ""
        }
      }
    );
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    console.error("HAVKAR Stripe webhook processing error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}
