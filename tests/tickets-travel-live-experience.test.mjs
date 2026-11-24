import assert from "node:assert/strict";
import fs from "node:fs";

const tickets = fs.readFileSync("tickets.html", "utf8");
const mapJs = fs.readFileSync("havkar-map.js", "utf8");
const toolbar = fs.readFileSync("havkar-map-pro-toolbar.js", "utf8");
const cameras = fs.readFileSync("lib/map-camera-sources.cjs", "utf8");
const report = fs.readFileSync(
  "store/TICKETS_TRAVEL_LIVE_EXPERIENCE_20261124.md",
  "utf8"
);

// Events stay separate
assert.match(tickets, /Event tickets[\s\S]*Events module/i);
assert.match(tickets, /data-ticket-type="events"/);
assert.match(tickets, /Events \(separate\)|Separate Events module/);
assert.doesNotMatch(tickets, /event_seats|havkar_claim_event_seat/);

// Journey HUD + consent
assert.match(tickets, /ticketsJourneyHud/);
assert.match(tickets, /ticketsGeoAccept/);
assert.match(tickets, /HAVKAR_GEO_CONSENT/);
assert.match(tickets, /watchPosition/);
assert.match(tickets, /Background tracking without consent is disabled/);
assert.match(mapJs, /geolocation_consent_required|HAVKAR_GEO_CONSENT/);
assert.match(toolbar, /HAVKAR_GEO_CONSENT/);

// Cameras honesty
assert.match(tickets, /Singapore LTA|Digitraffic|Calgary|JamCams/);
assert.match(tickets, /never labeled LIVE|JPEG snapshots are never labeled LIVE/i);
assert.match(cameras, /singapore-lta/);
assert.match(cameras, /UNKNOWN is never labeled LIVE/);

// Vehicle live status honesty
assert.match(tickets, /Not available without licensed feed|licensed operator feed/);

// Fee separation
assert.match(tickets, /Marketplace 5%[\s\S]*never mixed|5% fees are not applied to taxi/i);
assert.match(tickets, /About HAVKAR/);
assert.match(
  tickets,
  /never mixed into flight\/train\/bus\/ferry\/event ticket pricing|not applied to taxi\/transfer partner redirects/i
);
assert.doesNotMatch(tickets, /application_fee.*0\.05|buyerPays.*flight/i);

// Omio preserved
assert.match(tickets, /omio-search-btn/);
assert.match(tickets, /Official Omio|Global Omio redirect/);

// Prefs
assert.match(tickets, /travelPrefSort/);
assert.match(tickets, /prefer_sort/);

assert.match(report, /✅|🟡|🔴/);
assert.match(report, /284/);

console.log("TICKETS_TRAVEL_LIVE_EXPERIENCE_TEST_OK");
