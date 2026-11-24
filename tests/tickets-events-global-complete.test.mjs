import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const eventsHtml = fs.readFileSync("events.html", "utf8");
const ticketsHtml = fs.readFileSync("tickets.html", "utf8");
const indexHtml = fs.readFileSync("index.html", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20261124220000_events_global_ops.sql",
  "utf8"
);
const feeExamples = require("../lib/havkar-fee-examples.cjs");
const report = fs.readFileSync(
  "store/TICKETS_EVENTS_GLOBAL_COMPLETE_20261124.md",
  "utf8"
);

// Home 15-tile grid preserved
assert.match(indexHtml, /class="menu-grid"/);
assert.match(indexHtml, /data-i18n="tickets"/);
assert.match(indexHtml, /data-i18n="events"/);
const tileLabels = (indexHtml.match(/tile-label/g) || []).length;
assert.ok(tileLabels >= 15, "home should keep 15+ tile labels, found " + tileLabels);

// Discovery / categories / map honesty
assert.match(eventsHtml, /data-category="concert"/);
assert.match(eventsHtml, /data-category="festival"/);
assert.match(eventsHtml, /discoveryRail/);
assert.match(eventsHtml, /setEventsViewMode/);
assert.match(eventsHtml, /hasValidCoords/);
assert.match(eventsHtml, /Never invents fake events|never invents fake events|HAVKAR never invents fake events/i);
assert.match(eventsHtml, /does not invent locations|will not invent map pins/i);
assert.match(eventsHtml, /openstreetmap\.org\/export\/embed/);
assert.match(eventsHtml, /cancellation_policy|eventCancelPolicy/);
assert.match(eventsHtml, /venue_lat|eventVenueLat/);
assert.match(eventsHtml, /requestEventRefund/);
assert.match(eventsHtml, /toggleEventSalesPause/);
assert.match(eventsHtml, /event_seats/);
assert.match(eventsHtml, /havkar_claim_event_seat|Optional seat labels/);
assert.match(eventsHtml, /\?event=/);
assert.match(eventsHtml, /offlineBanner/);
assert.match(eventsHtml, /No new HAVKAR ticket commission/);

// Tickets hub still links to events ops
assert.match(ticketsHtml, /events\.html\?open=create/);
assert.match(ticketsHtml, /events\.html\?open=my-event-tickets/);

// Migration additive
assert.match(migration, /event_seats/);
assert.match(migration, /havkar_claim_event_seat/);
assert.match(migration, /event_refund_requests/);
assert.match(migration, /venue_lat/);
assert.match(migration, /No automatic Stripe refund|never auto-execute/i);
assert.doesNotMatch(migration, /DROP TABLE public\.events/i);

// Fee policy not invented
const example = feeExamples.eventTicketExample(20);
assert.equal(example.application_fee, null);
assert.equal(example.connect, false);
assert.match(report, /کارمزد|fee|Owner/i);
assert.match(report, /🟡|✅|🔴/);

// Security: no secret key patterns in events page
assert.doesNotMatch(eventsHtml, /sk_live_|sk_test_|service_role/);

console.log("TICKETS_EVENTS_GLOBAL_COMPLETE_TEST_OK");
