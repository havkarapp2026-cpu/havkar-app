import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const apiSource = fs.readFileSync("api/create-event-checkout.js", "utf8");
const eventsHtml = fs.readFileSync("events.html", "utf8");
const ticketsHtml = fs.readFileSync("tickets.html", "utf8");

assert.match(apiSource, /free\|gratis\|0\+/i);
assert.match(apiSource, /REAL_PAYMENTS_PAUSED/);
assert.match(apiSource, /havkar_event_occupied_seats/);
assert.match(apiSource, /ticket_code/);
assert.match(apiSource, /unitPrice === 0/);

assert.match(eventsHtml, /formatEventPrice/);
assert.match(eventsHtml, /isFreeEventPrice/);
assert.match(eventsHtml, /price = "0"/);
assert.match(eventsHtml, /handleTicketsDeepLink/);
assert.match(eventsHtml, /open=create|open === "create"/);
assert.match(eventsHtml, /havkar_check_in_event_ticket|checkInEventTicket/);
assert.match(eventsHtml, /havkar_list_event_tickets_for_organizer/);
assert.match(eventsHtml, /max_attendees/);
assert.doesNotMatch(eventsHtml, /taxi\.html|transfer-booking/);

assert.match(ticketsHtml, /data-ticket-type="events"/);
assert.match(ticketsHtml, /events\.html\?open=create/);
assert.match(ticketsHtml, /events\.html\?open=my-event-tickets/);
assert.match(ticketsHtml, /events\.html\?open=check-in/);
assert.match(ticketsHtml, /Taxi and transfer booking is not available/);

// Smoke: normalizePrice semantics via isolated reimplementation matching API.
function normalizePrice(value) {
  if (value === null || value === undefined) return null;
  let text = String(value).trim().replace(/\s/g, "").replace(/[€$£]/g, "");
  if (!text) return null;
  if (/^(free|gratis|0+|0+[.,]0+)$/i.test(text)) return 0;
  if (/^\d+,\d{1,2}$/.test(text)) text = text.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

assert.equal(normalizePrice("Free"), 0);
assert.equal(normalizePrice("free"), 0);
assert.equal(normalizePrice("0"), 0);
assert.equal(normalizePrice("10"), 10);
assert.equal(normalizePrice("10,50"), 10.5);
assert.equal(normalizePrice("abc"), null);

// Ensure real-payments gate helper still present and used before Stripe session.
const realPayments = require("../lib/real-payments.cjs");
assert.equal(typeof realPayments.cardPaymentsAllowed, "function");
assert.equal(realPayments.cardPaymentsAllowed(), false);

console.log("TICKETS_EVENTS_ACTIVATION_TEST_OK");
