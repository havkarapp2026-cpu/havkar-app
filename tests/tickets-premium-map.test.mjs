import assert from "node:assert/strict";
import fs from "node:fs";

const tickets = fs.readFileSync("tickets.html", "utf8");
const mapJs = fs.readFileSync("havkar-tickets-map.js", "utf8");
const flights = fs.readFileSync("api/flights.js", "utf8");

assert.match(tickets, /ticketsWorldMap/);
assert.match(tickets, /HAVKAR Global Map/);
assert.match(tickets, /Explore the world/);
assert.match(tickets, /leaflet@1\.9\.4/);
assert.match(tickets, /havkar-tickets-map\.js/);
assert.match(tickets, /data-map-mode="flight"/);
assert.match(tickets, /accommodation\.html/);
assert.match(tickets, /Guest Hotels search/);
assert.match(tickets, /Omio affiliate/);
assert.match(tickets, /Duffel/);
assert.match(tickets, /Event Tickets/);
assert.doesNotMatch(tickets, /Awaiting partner access[\s\S]*Reserved for Omio flight search/);

assert.match(mapJs, /basemaps\.cartocdn\.com/);
assert.match(mapJs, /action=geocode/);
assert.match(mapJs, /Does not invent/);
assert.match(mapJs, /HAVKAR_TICKETS_MAP/);

assert.match(flights, /action === "geocode"/);
assert.match(flights, /geocodeDestination/);

assert.match(fs.readFileSync("lib/duffel-places.cjs", "utf8"), /searchAirportSuggestions/);
assert.ok(fs.existsSync("lib/flight-dob.cjs"));
assert.ok(fs.existsSync("lib/stripe-ticket-settlement.cjs"));

console.log("TICKETS_PREMIUM_MAP_TEST_OK");
