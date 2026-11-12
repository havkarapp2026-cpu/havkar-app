import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import Stripe from "stripe";

const require = createRequire(import.meta.url);
const {
  processStripeEvent,
  REQUIRED_WEBHOOK_EVENTS
} = require("../lib/stripe-webhook-processor.cjs");

function memoryStore() {
  const events = new Set();
  const tickets = new Map();
  const payouts = [];
  return {
    events,
    tickets,
    payouts,
    async insertEvent(row) {
      if (events.has(row.stripe_event_id)) return { duplicate: true };
      events.add(row.stripe_event_id);
      return { duplicate: false };
    },
    async getTicket(id) {
      return tickets.get(String(id)) || null;
    },
    async markTicketPaid({ ticketId, sessionId, paidAt }) {
      const t = tickets.get(String(ticketId));
      Object.assign(t, {
        payment_status: "paid",
        ticket_status: "valid",
        payment_reference: sessionId,
        paid_at: paidAt,
        ticket_code: t.ticket_code || "ABC123XYZ"
      });
    },
    async markTicketFailed({ ticketId, reason, at }) {
      const t = tickets.get(String(ticketId));
      if (!t) return;
      Object.assign(t, {
        payment_status: "failed",
        ticket_status: "cancelled",
        cancelled_at: at,
        cancel_reason: reason
      });
    },
    async updateTicketSettlement(ticketId, patch) {
      Object.assign(tickets.get(String(ticketId)), patch);
    },
    async recordPayoutEvent(row) {
      payouts.push(row);
      return { duplicate: false };
    }
  };
}

test("required webhook event list covers success failure refund dispute payout", () => {
  for (const needed of [
    "checkout.session.completed",
    "checkout.session.async_payment_failed",
    "charge.refunded",
    "charge.dispute.created",
    "payout.paid",
    "payout.failed"
  ]) {
    assert.ok(REQUIRED_WEBHOOK_EVENTS.includes(needed), needed);
  }
});

test("paid checkout activates ticket once; duplicate is idempotent", async () => {
  const store = memoryStore();
  store.tickets.set("42", {
    id: 42,
    payment_status: "pending",
    ticket_status: "pending",
    payment_reference: null,
    ticket_code: "TCKT42"
  });
  const event = {
    id: "evt_1",
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: "cs_test_1",
        payment_status: "paid",
        metadata: { event_ticket_id: "42", test_mode: "true" }
      }
    }
  };
  const first = await processStripeEvent(event, store);
  assert.equal(first.applied, true);
  assert.equal(store.tickets.get("42").payment_status, "paid");
  assert.equal(store.tickets.get("42").ticket_status, "valid");
  const second = await processStripeEvent(event, store);
  assert.equal(second.duplicate, true);
});

test("expired checkout fails pending ticket", async () => {
  const store = memoryStore();
  store.tickets.set("7", {
    id: 7,
    payment_status: "pending",
    ticket_status: "pending"
  });
  const result = await processStripeEvent(
    {
      id: "evt_exp",
      type: "checkout.session.expired",
      livemode: false,
      data: {
        object: { id: "cs_x", metadata: { event_ticket_id: "7" } }
      }
    },
    store
  );
  assert.equal(result.applied, true);
  assert.equal(store.tickets.get("7").payment_status, "failed");
});

test("refund settlement cancels paid ticket", async () => {
  const store = memoryStore();
  store.tickets.set("9", {
    id: 9,
    payment_status: "paid",
    ticket_status: "valid",
    payment_reference: "cs_9"
  });
  const result = await processStripeEvent(
    {
      id: "evt_ref",
      type: "charge.refunded",
      livemode: false,
      data: {
        object: {
          id: "ch_1",
          metadata: { event_ticket_id: "9" }
        }
      }
    },
    store
  );
  assert.equal(result.applied, true);
  assert.equal(store.tickets.get("9").payment_status, "refunded");
  assert.equal(store.tickets.get("9").ticket_status, "cancelled");
});

test("payout.paid is recorded for reconciliation", async () => {
  const store = memoryStore();
  const result = await processStripeEvent(
    {
      id: "evt_po",
      type: "payout.paid",
      livemode: true,
      data: {
        object: {
          id: "po_1",
          status: "paid",
          amount: 730,
          currency: "eur"
        }
      }
    },
    store
  );
  assert.equal(result.kind, "payout");
  assert.equal(store.payouts.length, 1);
  assert.equal(store.payouts[0].payout_id, "po_1");
});

test("Stripe signature helper constructs verifiable test header", () => {
  const stripe = new Stripe("sk_test_placeholder");
  const payload = JSON.stringify({
    id: "evt_sig",
    object: "event",
    type: "checkout.session.completed",
    data: { object: { id: "cs_1" } }
  });
  const secret = "whsec_test_secret";
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret
  });
  const event = stripe.webhooks.constructEvent(payload, header, secret);
  assert.equal(event.id, "evt_sig");
});
