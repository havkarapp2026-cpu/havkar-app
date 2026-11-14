import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const {
  ticketIdFromMetadata,
  settlementActionForEvent,
  ticketUpdateFromSettlement,
  isDuplicatePaidActivation
} = require("../lib/stripe-ticket-settlement.cjs");

assert.equal(ticketIdFromMetadata({ event_ticket_id: "42" }), "42");
assert.equal(ticketIdFromMetadata({ event_ticket_id: "bad" }), "");
assert.equal(ticketIdFromMetadata(null), "");

assert.equal(settlementActionForEvent("charge.refunded").kind, "refund");
assert.equal(settlementActionForEvent("charge.dispute.created").kind, "dispute_opened");
assert.equal(settlementActionForEvent("charge.dispute.updated").kind, "dispute_updated");
assert.equal(settlementActionForEvent("payout.created").kind, "payout");
assert.equal(settlementActionForEvent("payout.paid").kind, "payout");
assert.equal(settlementActionForEvent("checkout.session.completed").kind, "ignore");

const refundPatch = ticketUpdateFromSettlement(
  settlementActionForEvent("charge.refunded"),
  "2026-11-10T00:00:00.000Z"
);
assert.equal(refundPatch.payment_status, "refunded");
assert.equal(refundPatch.ticket_status, "cancelled");
assert.equal(
  ticketUpdateFromSettlement(settlementActionForEvent("payout.paid"), "x"),
  null
);

assert.equal(
  isDuplicatePaidActivation(
    { payment_status: "paid", ticket_status: "valid", payment_reference: "cs_test_1" },
    "cs_test_1"
  ),
  true
);
assert.equal(
  isDuplicatePaidActivation(
    { payment_status: "pending", ticket_status: "pending", payment_reference: null },
    "cs_test_1"
  ),
  false
);

const webhook = fs.readFileSync("api/stripe-webhook.js", "utf8");
assert.match(webhook, /stripe-webhook-processor\.cjs/);
assert.match(webhook, /constructEvent/);
assert.match(webhook, /stripe_webhook_events/);
assert.match(webhook, /bodyParser:\s*false/);
assert.doesNotMatch(webhook, /sk_live_[A-Za-z0-9]+/);

const processor = fs.readFileSync("lib/stripe-webhook-processor.cjs", "utf8");
assert.match(processor, /stripe-ticket-settlement\.cjs/);
assert.match(processor, /charge\.dispute\.closed/);
assert.match(processor, /charge\.dispute\.updated/);
assert.match(processor, /payout\.created/);
assert.match(processor, /checkout\.session\.async_payment_failed/);

const checkout = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(checkout, /idempotencyKey:/);
assert.match(checkout, /havkar-event-ticket-/);
assert.match(checkout, /eventCardCheckoutAllowed/);
assert.match(checkout, /checkout\.sessions\.create/);

const events = fs.readFileSync("events.html", "utf8");
assert.match(events, /checkout\.stripe\.com/);
assert.match(events, /\/api\/create-event-checkout/);
assert.match(events, /handleEventCheckoutReturn/);

console.log("STRIPE_TICKET_SETTLEMENT_TEST_OK");
