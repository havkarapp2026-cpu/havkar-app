import assert from "node:assert/strict";
import fs from "node:fs";

const tickets = fs.readFileSync("tickets.html", "utf8");

const TRACKED =
  "https://omio.sjv.io/c/7763968/3963000/7385";

assert.match(tickets, /data-omio-widget="true"/);
assert.match(tickets, /data-partner-id="omio-affiliates"/);
assert.match(tickets, new RegExp(TRACKED.replace(/\//g, "\\/") + "\\?u="));
assert.match(tickets, /7763968/);
assert.match(tickets, /3963000/);
assert.match(tickets, /7385/);

assert.match(
  tickets,
  /gcs-proxy\/b2b-nemo-prod\/bundle\/en\/bundle\.js/
);
assert.match(
  tickets,
  /gcs-proxy\/b2b-nemo-prod\/bundle\/en\/bundle\.css/
);

// Train/bus/ferry live; flights stay Duffel; taxi/transfer stay disabled
assert.match(tickets, /id="ticket-train"/);
assert.match(tickets, /id="ticket-bus"/);
assert.match(tickets, /id="ticket-ferry"/);
assert.match(tickets, /data-default-travel-mode="bus"/);
assert.match(tickets, /data-default-travel-mode="ferry"/);
assert.match(tickets, /data-new-tab="true"/);
assert.match(tickets, /Omio affiliate live/);
assert.match(tickets, /Booking is completed on Omio/);

assert.match(tickets, /Duffel/);
assert.match(tickets, /\/api\/flights/);
assert.match(tickets, /Taxi and transfer booking is not available inside HAVKAR/);
assert.doesNotMatch(tickets, /welcomepickups\.com\/widget/);
assert.doesNotMatch(tickets, /api\.omio\.com/);
assert.doesNotMatch(tickets, /Awaiting partner access/);
assert.doesNotMatch(tickets, /No booking is offered from HAVKAR in the meantime/);

// Mobile-friendly host + tracked fallback CTAs
assert.match(tickets, /\.omio-widget-host/);
assert.match(tickets, /min-height:44px/);
assert.match(tickets, /Open Omio train search/);
assert.match(tickets, /Open Omio bus search/);
assert.match(tickets, /Open Omio ferry search/);

console.log("OMIO_AFFILIATE_RESTORE_TEST_OK");
