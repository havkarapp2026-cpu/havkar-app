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
const {
  buildEntryFromStripeEvent,
  postJournalEntry
} = require("./havkar-finance-ledger.cjs");
const {
  buildReceiptFromPayment,
  nextDocumentNumber
} = require("./havkar-finance-documents.cjs");

const TICKET_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "payout.created",
  "payout.paid",
  "payout.failed",
  "transfer.created",
  "transfer.updated",
  "transfer.reversed"
]);

const REQUIRED_WEBHOOK_EVENTS = Object.freeze([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "payout.created",
  "payout.paid",
  "payout.failed",
  "account.updated",
  "account.external_account.updated",
  "transfer.created",
  "transfer.updated",
  "transfer.reversed"
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

/**
 * Destination-charge marketplace Checkout: mark the ads listing ended only after
 * Stripe reports payment_status=paid. Never trust browser redirects alone.
 * Does not insert into legacy marketplace_orders (FK targets marketplace_listings UUID).
 */
async function fulfillMarketplaceCheckout(store, session, nowIso) {
  const meta = (session && session.metadata) || {};
  if (String(meta.havkar_flow || "") !== "marketplace") {
    return { ok: true, applied: false, reason: "not_marketplace_flow" };
  }
  if (session.payment_status && session.payment_status !== "paid") {
    return {
      ok: true,
      applied: false,
      reason: "payment_not_paid",
      payment_status: session.payment_status
    };
  }
  const listingId = Number(meta.listing_id);
  if (!Number.isSafeInteger(listingId) || listingId <= 0) {
    return { ok: true, applied: false, reason: "missing_listing_id" };
  }
  if (typeof store.fulfillMarketplaceListing !== "function") {
    return {
      ok: false,
      applied: false,
      reason: "store_missing_fulfillMarketplaceListing"
    };
  }
  const result = await store.fulfillMarketplaceListing({
    listingId,
    sessionId: session.id,
    buyerUserId: meta.havkar_user_id || null,
    sellerUserId: meta.seller_id || null,
    amountTotal: session.amount_total,
    currency: session.currency,
    paidAt: nowIso
  });
  return Object.assign(
    {
      ok: true,
      kind: "marketplace",
      listing_id: listingId,
      session_id: session.id
    },
    result || {}
  );
}

/**
 * Checkout abandoned/expired: restore reserved marketplace listing to active.
 * Does not invent refunds. Paid sessions are handled by fulfillMarketplaceCheckout.
 */
async function releaseMarketplaceCheckoutReservation(store, session, reason) {
  const meta = (session && session.metadata) || {};
  if (String(meta.havkar_flow || "") !== "marketplace") {
    return { ok: true, applied: false, reason: "not_marketplace_flow" };
  }
  const listingId = Number(meta.listing_id);
  if (!Number.isSafeInteger(listingId) || listingId <= 0) {
    return { ok: true, applied: false, reason: "missing_listing_id" };
  }
  if (typeof store.releaseMarketplaceReservation !== "function") {
    return {
      ok: true,
      applied: false,
      reason: "store_missing_releaseMarketplaceReservation",
      listing_id: listingId
    };
  }
  const result = await store.releaseMarketplaceReservation({
    listingId,
    sessionId: session && session.id,
    reason: reason || "checkout_expired"
  });
  return Object.assign(
    {
      ok: true,
      kind: "marketplace_release",
      listing_id: listingId,
      session_id: session && session.id
    },
    result || {}
  );
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

async function resolveMarketplaceListingIdFromCharge(
  chargeOrObject,
  stripeClient
) {
  const direct =
    chargeOrObject &&
    chargeOrObject.metadata &&
    chargeOrObject.metadata.listing_id;
  if (direct != null && String(direct).trim() !== "") {
    const n = Number(direct);
    if (Number.isSafeInteger(n) && n > 0) return n;
  }
  const flow =
    chargeOrObject &&
    chargeOrObject.metadata &&
    chargeOrObject.metadata.havkar_flow;
  if (String(flow || "") === "marketplace") {
    const n = Number(
      chargeOrObject &&
        chargeOrObject.metadata &&
        chargeOrObject.metadata.listing_id
    );
    if (Number.isSafeInteger(n) && n > 0) return n;
  }
  if (
    chargeOrObject &&
    typeof chargeOrObject.payment_intent === "string" &&
    chargeOrObject.payment_intent.startsWith("pi_") &&
    stripeClient
  ) {
    try {
      const intent = await stripeClient.paymentIntents.retrieve(
        chargeOrObject.payment_intent
      );
      const meta = (intent && intent.metadata) || {};
      if (String(meta.havkar_flow || "") !== "marketplace") return null;
      const n = Number(meta.listing_id);
      if (Number.isSafeInteger(n) && n > 0) return n;
    } catch (_err) {
      return null;
    }
  }
  return null;
}

/**
 * Marketplace card refund/dispute: audit + listing status update.
 * Does not invent bank refunds. Relisting after refund stays manual/Owner-reviewed
 * (status becomes refunded/disputed, never silently back to active).
 */
async function applyMarketplaceChargeSettlement(store, event, stripeClient, nowIso) {
  const chargeOrObject = event && event.data && event.data.object;
  const listingId = await resolveMarketplaceListingIdFromCharge(
    chargeOrObject,
    stripeClient
  );
  if (!listingId) {
    return { ok: true, applied: false, reason: "not_marketplace_charge" };
  }
  if (typeof store.settleMarketplaceCharge !== "function") {
    return {
      ok: true,
      applied: false,
      reason: "store_missing_settleMarketplaceCharge",
      listing_id: listingId
    };
  }
  let outcome = "marketplace_charge_event";
  let nextStatus = null;
  if (event.type === "charge.refunded") {
    outcome = "marketplace_card_refunded";
    nextStatus = "refunded";
  } else if (event.type === "charge.dispute.created") {
    outcome = "marketplace_card_dispute_opened";
    nextStatus = "disputed";
  } else if (event.type === "charge.dispute.closed") {
    const status = String((chargeOrObject && chargeOrObject.status) || "");
    outcome =
      status === "lost"
        ? "marketplace_card_dispute_lost"
        : "marketplace_card_dispute_closed";
    nextStatus = status === "lost" ? "refunded" : "ended";
  } else if (event.type === "charge.dispute.updated") {
    outcome = "marketplace_card_dispute_updated";
  }
  const result = await store.settleMarketplaceCharge({
    listingId,
    eventType: event.type,
    outcome,
    nextStatus,
    chargeId: chargeOrObject && chargeOrObject.id,
    paymentIntentId: chargeOrObject && chargeOrObject.payment_intent,
    amount: chargeOrObject && chargeOrObject.amount,
    currency: chargeOrObject && chargeOrObject.currency,
    at: nowIso
  });
  return Object.assign(
    {
      ok: true,
      kind: "marketplace_settlement",
      listing_id: listingId,
      settlement_event: event.type
    },
    result || {}
  );
}

async function applyChargeSettlement(store, event, stripeClient, nowIso) {
  const marketplace = await applyMarketplaceChargeSettlement(
    store,
    event,
    stripeClient,
    nowIso
  );
  if (marketplace && marketplace.applied) {
    return marketplace;
  }

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
    ticket_id: ticketId || null,
    marketplace_probe: marketplace
  };
}

async function applyConnectAccountUpdate(store, event, nowIso) {
  const account = event && event.data && event.data.object;
  if (!account || !account.id) {
    return { ok: true, applied: false, reason: "missing_account" };
  }
  if (typeof store.updateConnectAccount !== "function") {
    return { ok: true, applied: false, reason: "store_missing_updateConnectAccount" };
  }
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;
  let onboardingStatus = "pending";
  if (account.requirements && account.requirements.disabled_reason) {
    onboardingStatus = "restricted";
  } else if (chargesEnabled && detailsSubmitted) {
    onboardingStatus = "complete";
  }
  await store.updateConnectAccount({
    stripe_account_id: String(account.id),
    charges_enabled: chargesEnabled,
    payouts_enabled: payoutsEnabled,
    details_submitted: detailsSubmitted,
    onboarding_status: onboardingStatus,
    updated_at: nowIso
  });
  return {
    ok: true,
    applied: true,
    stripe_account_id: String(account.id),
    onboarding_status: onboardingStatus,
    settlement_event: event.type
  };
}

async function postAccountingFromEvent(event, store, options = {}) {
  if (!store || typeof store.postFinanceJournal !== "function") {
    return { ok: true, skipped: true, reason: "store_missing_postFinanceJournal" };
  }
  const built = buildEntryFromStripeEvent(event);
  if (!built || built.skipped || !built.ok) {
    return { ok: true, skipped: true, reason: (built && built.reason) || "no_entry" };
  }
  const posted = await store.postFinanceJournal(built);
  if (
    posted &&
    posted.posted &&
    typeof store.insertFinanceDocument === "function" &&
    built.entry &&
    !String(event.type || "").startsWith("charge.refund")
  ) {
    const amount =
      posted.amount_cents ||
      (built.lines || []).reduce(
        (sum, line) => sum + Number(line.debit_cents || 0),
        0
      );
    const seq =
      typeof store.nextFinanceDocumentSequence === "function"
        ? await store.nextFinanceDocumentSequence("payment_receipt")
        : Date.now() % 1000000;
    const receipt = buildReceiptFromPayment({
      document_number: nextDocumentNumber("payment_receipt", seq),
      amount_cents: amount,
      currency: built.entry.currency,
      source_object_id: built.entry.source_object_id,
      payment_reference: built.entry.source_object_id,
      journal_entry_id: posted.entry_id,
      description: built.entry.memo,
      customer_email:
        event &&
        event.data &&
        event.data.object &&
        event.data.object.customer_details &&
        event.data.object.customer_details.email,
      gates: options.financeGates || null,
      operator: options.operator || null,
      metadata: { stripe_event_id: event.id }
    });
    if (receipt.ok) {
      await store.insertFinanceDocument(receipt.document);
    }
  }
  return posted;
}

async function processStripeEvent(event, store, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const claimed = await claimWebhookEvent(store, event);
  if (claimed && claimed.duplicate) {
    return { ok: true, duplicate: true, event_type: event.type };
  }

  const accounting = await postAccountingFromEvent(event, store, options);

  if (
    !TICKET_EVENT_TYPES.has(event.type) &&
    event.type !== "account.updated" &&
    event.type !== "account.external_account.updated"
  ) {
    return {
      ok: true,
      ignored: true,
      event_type: event.type,
      accounting
    };
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;
    const meta = (session && session.metadata) || {};
    if (String(meta.havkar_flow || "") === "marketplace") {
      const marketplace = await fulfillMarketplaceCheckout(
        store,
        session,
        nowIso
      );
      return Object.assign({}, marketplace, { accounting });
    }
    const ticket = await activatePaidTicket(store, session, nowIso);
    return Object.assign({}, ticket, { accounting });
  }

  if (
    event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired"
  ) {
    const session = event.data.object;
    const meta = (session && session.metadata) || {};
    if (String(meta.havkar_flow || "") === "marketplace") {
      const released = await releaseMarketplaceCheckoutReservation(
        store,
        session,
        event.type === "checkout.session.expired"
          ? "stripe_checkout_expired"
          : "stripe_async_payment_failed"
      );
      return Object.assign({}, released, { accounting });
    }
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

  if (event.type === "payment_intent.succeeded") {
    // Checkout fulfillment remains authoritative via checkout.session.*.
    // PI success is recorded for ledger/idempotency and activates only when
    // ticket metadata is present on the PaymentIntent itself.
    const intent = event.data.object;
    const ticketId = ticketIdFromMetadata(intent && intent.metadata);
    if (!ticketId) {
      return { ok: true, applied: false, reason: "pi_succeeded_no_ticket_metadata" };
    }
    return activatePaidTicket(
      store,
      {
        id: intent.id,
        payment_status: "paid",
        metadata: intent.metadata
      },
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
    event.type === "account.updated" ||
    event.type === "account.external_account.updated"
  ) {
    return applyConnectAccountUpdate(store, event, nowIso);
  }

  if (event.type.startsWith("transfer.")) {
    // Destination-charge transfer lifecycle: claimed above for idempotency.
    return {
      ok: true,
      applied: true,
      kind: "transfer",
      settlement_event: event.type,
      transfer_id: objectIdFromEvent(event)
    };
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
  activatePaidTicket,
  fulfillMarketplaceCheckout,
  releaseMarketplaceCheckoutReservation,
  applyMarketplaceChargeSettlement,
  resolveMarketplaceListingIdFromCharge,
  postAccountingFromEvent
};
