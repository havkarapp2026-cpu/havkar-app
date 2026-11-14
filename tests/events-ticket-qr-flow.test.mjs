/**
 * Non-production Events ticket fulfillment: paid webhook → ticket_code QR payload.
 * Does not call live Stripe or modify Production.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { processStripeEvent } = require("../lib/stripe-webhook-processor.cjs");

test("paid Stripe session yields QR-ready ticket_code for events UI", async () => {
  const ticket = {
    id: 1001,
    payment_status: "pending",
    ticket_status: "pending",
    payment_reference: null,
    ticket_code: "HAVKARQR1001"
  };
  const store = {
    async insertEvent() {
      return { duplicate: false };
    },
    async getTicket() {
      return ticket;
    },
    async markTicketPaid({ sessionId, paidAt }) {
      ticket.payment_status = "paid";
      ticket.ticket_status = "valid";
      ticket.payment_reference = sessionId;
      ticket.paid_at = paidAt;
    },
    async markTicketFailed() {},
    async updateTicketSettlement() {},
    async recordPayoutEvent() {}
  };

  const result = await processStripeEvent(
    {
      id: "evt_qr_1",
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: "cs_test_qr",
          payment_status: "paid",
          metadata: {
            event_ticket_id: "1001",
            test_mode: "true",
            havkar_flow: "events"
          }
        }
      }
    },
    store
  );

  assert.equal(result.applied, true);
  assert.equal(ticket.payment_status, "paid");
  assert.equal(ticket.ticket_status, "valid");
  assert.equal(ticket.ticket_code, "HAVKARQR1001");

  const qrData = "HAVKAR:" + ticket.ticket_code;
  assert.equal(qrData, "HAVKAR:HAVKARQR1001");

  const eventsHtml = fs.readFileSync("events.html", "utf8");
  assert.match(eventsHtml, /api\.qrserver\.com\/v1\/create-qr-code/);
  assert.match(eventsHtml, /"HAVKAR:" \+ ticketCode/);
  assert.match(eventsHtml, /my-event-tickets/);
});
