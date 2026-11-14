/*
 * Pure helpers for Stripe ticket settlement webhooks.
 * No secrets. No network. Safe for unit tests.
 */

function ticketIdFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return "";
  const raw = metadata.event_ticket_id;
  if (raw == null) return "";
  const text = String(raw).trim();
  return /^\d{1,18}$/.test(text) ? text : "";
}

function settlementActionForEvent(eventType) {
  const type = String(eventType || "");
  if (type === "charge.refunded") {
    return {
      kind: "refund",
      payment_status: "refunded",
      ticket_status: "cancelled",
      cancel_reason: "stripe_charge_refunded"
    };
  }
  if (type === "charge.dispute.created") {
    return {
      kind: "dispute_opened",
      payment_status: "disputed",
      ticket_status: "cancelled",
      cancel_reason: "stripe_dispute_created"
    };
  }
  if (type === "charge.dispute.updated") {
    return {
      kind: "dispute_updated",
      payment_status: null,
      ticket_status: null,
      cancel_reason: null
    };
  }
  if (type === "charge.dispute.closed") {
    return {
      kind: "dispute_closed",
      payment_status: null,
      ticket_status: null,
      cancel_reason: null
    };
  }
  if (
    type === "payout.created" ||
    type === "payout.paid" ||
    type === "payout.failed"
  ) {
    return {
      kind: "payout",
      payment_status: null,
      ticket_status: null,
      cancel_reason: null
    };
  }
  return { kind: "ignore", payment_status: null, ticket_status: null, cancel_reason: null };
}

function ticketUpdateFromSettlement(action, nowIso) {
  if (!action || !action.payment_status || !action.ticket_status) {
    return null;
  }
  return {
    payment_status: action.payment_status,
    ticket_status: action.ticket_status,
    cancelled_at: nowIso,
    cancel_reason: action.cancel_reason || "stripe_settlement"
  };
}

function isDuplicatePaidActivation(ticket, sessionId) {
  if (!ticket) return false;
  return (
    ticket.payment_status === "paid" &&
    ticket.ticket_status === "valid" &&
    String(ticket.payment_reference || "") === String(sessionId || "")
  );
}

module.exports = {
  ticketIdFromMetadata,
  settlementActionForEvent,
  ticketUpdateFromSettlement,
  isDuplicatePaidActivation
};
