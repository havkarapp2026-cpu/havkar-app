/*
 * Stripe webhook processing helpers (pure + injectable store).
 * Signature verification stays in the HTTP handler.
 */

const {
  ticketIdFromMetadata,
  settlementActionForEvent,
  ticketUpdateFromSettlement,
  isDuplicatePaidActivation
} = require("./stripe-ticket-settlement.cjs");

const TICKET_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "payout.created",
  "payout.paid",
  "payout.failed"
]);

const REQUIRED_WEBHOOK_EVENTS = Object.freeze([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "payout.created",
  "payout.paid",
  "payout.failed",
  "account.updated",
  "account.external_account.updated"
]);

function isTestModeTicketEvent(event) {
  const obj = event && event.data && event.data.object;
  if (!obj) return false;
  if (obj.metadata && obj.metadata.test_mode === "true") return true;
  if (obj.metadata && obj.metadata.havkar_test_mode === "true") return true;
  return event.livemode === false;
}

function objectIdFromEvent(event) {
  const obj = event && event.data && event.data.object;
  if (!obj) return null;
  return obj.id ? String(obj.id) : null;
}

async function claimWebhookEvent(store, event) {
  if (!store || typeof store.insertEvent !== "function") {
    return { duplicate: false };
  }
  return store.insertEvent({
    stripe_event_id: event.id,
    event_type: event.type,
    livemode: event.livemode === true,
    object_id: objectIdFromEvent(event)
  });
}

async function activatePaidTicket(store, session, nowIso) {
  const ticketId = ticketIdFromMetadata(session && session.metadata);
  if (!ticketId) {
    return { ok: true, applied: false, reason: "missing_ticket_metadata" };
  }
  if (session.payment_status && session.payment_status !== "paid") {
    return {
      ok: true,
      applied: false,
      reason: "payment_not_paid",
      payment_status: session.payment_status
    };
  }
  const existing = await store.getTicket(ticketId);
  if (!existing) {
    return { ok: true, applied: false, reason: "ticket_not_found" };
  }
  if (isDuplicatePaidActivation(existing, session.id)) {
    return { ok: true, applied: false, duplicate: true };
  }
  await store.markTicketPaid({
    ticketId,
    sessionId: session.id,
    paidAt: nowIso
  });
  return { ok: true, applied: true, ticket_id: ticketId };
}

async function markTicketPaymentFailed(store, ticketId, reason, nowIso) {
  if (!ticketId) {
    return { ok: true, applied: false, reason: "missing_ticket_metadata" };
  }
  await store.markTicketFailed({
    ticketId,
    reason,
    at: nowIso
  });
  return { ok: true, applied: true, ticket_id: ticketId };
}

async function applyChargeSettlement(store, event, stripeClient, nowIso) {
  const action = settlementActionForEvent(event.type);
  const chargeOrObject = event.data && event.data.object;
  let ticketId = ticketIdFromMetadata(
    chargeOrObject && chargeOrObject.metadata
  );

  if (
    !ticketId &&
    chargeOrObject &&
    typeof chargeOrObject.payment_intent === "string" &&
    chargeOrObject.payment_intent.startsWith("pi_") &&
    stripeClient
  ) {
    try {
      const intent = await stripeClient.paymentIntents.retrieve(
        chargeOrObject.payment_intent
      );
      ticketId = ticketIdFromMetadata(intent && intent.metadata);
    } catch (_err) {
      // leave ticketId empty
    }
  }

  const patch = ticketUpdateFromSettlement(action, nowIso);
  if (ticketId && patch) {
    await store.updateTicketSettlement(ticketId, patch);
    return {
      ok: true,
      applied: true,
      ticket_id: ticketId,
      settlement_event: event.type
    };
  }

  if (action.kind === "payout") {
    if (typeof store.recordPayoutEvent === "function") {
      await store.recordPayoutEvent({
        stripe_event_id: event.id,
        event_type: event.type,
        payout_id: objectIdFromEvent(event),
        livemode: event.livemode === true,
        status: chargeOrObject && chargeOrObject.status,
        amount: chargeOrObject && chargeOrObject.amount,
        currency: chargeOrObject && chargeOrObject.currency,
        received_at: nowIso
      });
    }
    return {
      ok: true,
      applied: true,
      settlement_event: event.type,
      kind: "payout"
    };
  }

  return {
    ok: true,
    applied: false,
    settlement_event: event.type,
    ticket_id: ticketId || null
  };
}

async function processStripeEvent(event, store, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const claimed = await claimWebhookEvent(store, event);
  if (claimed && claimed.duplicate) {
    return { ok: true, duplicate: true, event_type: event.type };
  }

  if (!TICKET_EVENT_TYPES.has(event.type) && event.type !== "account.updated") {
    return { ok: true, ignored: true, event_type: event.type };
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    return activatePaidTicket(store, event.data.object, nowIso);
  }

  if (
    event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired"
  ) {
    const session = event.data.object;
    const ticketId = ticketIdFromMetadata(session && session.metadata);
    return markTicketPaymentFailed(
      store,
      ticketId,
      event.type === "checkout.session.expired"
        ? "stripe_checkout_expired"
        : "stripe_async_payment_failed",
      nowIso
    );
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object;
    const ticketId = ticketIdFromMetadata(intent && intent.metadata);
    return markTicketPaymentFailed(
      store,
      ticketId,
      "stripe_payment_intent_failed",
      nowIso
    );
  }

  if (
    event.type.startsWith("charge.") ||
    event.type.startsWith("payout.")
  ) {
    return applyChargeSettlement(store, event, options.stripe, nowIso);
  }

  return { ok: true, ignored: true, event_type: event.type };
}

module.exports = {
  TICKET_EVENT_TYPES,
  REQUIRED_WEBHOOK_EVENTS,
  isTestModeTicketEvent,
  processStripeEvent,
  claimWebhookEvent,
  activatePaidTicket
};
