import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tickets = fs.readFileSync("tickets.html", "utf8");
const life = fs.readFileSync("havkar-travel-life.js", "utf8");
const catalog = fs.readFileSync("havkar-camera-catalog.js", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20261125120000_travel_life_platform.sql",
  "utf8"
);
const report = fs.readFileSync(
  "store/TICKETS_TRAVEL_LIFE_PLATFORM_20261125.md",
  "utf8"
);
const indexHtml = fs.readFileSync("index.html", "utf8");
const { omioConfigured } = require("../lib/omio-adapter.cjs");
const { classifyDuffelAccessToken } = require("../lib/duffel-live-ready.cjs");

// Preserve Events separation + prior travel modes
assert.match(tickets, /data-ticket-type="flight"/);
assert.match(tickets, /data-ticket-type="events"/);
assert.match(tickets, /Events \(separate\)|Separate Events module/);
assert.doesNotMatch(tickets, /havkar_claim_event_seat/);

// New travel-life modes
["personal", "mytrips", "cameras", "memories", "reminders"].forEach((mode) => {
  assert.match(tickets, new RegExp('data-ticket-type="' + mode + '"'));
  assert.match(tickets, new RegExp('data-ticket-panel="' + mode + '"'));
});

// UX: scroll + IATA honesty
assert.match(tickets, /scrollIntoView\(\{ block: "start", behavior: "smooth" \}/);
assert.match(tickets, /Origin airport code \(IATA\)/);
assert.match(tickets, /translate="no"/);
assert.match(tickets, /Use 3-letter airport codes/);
assert.match(tickets, /Return date \(optional\)/);
assert.match(tickets, /<details class="panel"/);

// Scripts wired
assert.match(tickets, /havkar-travel-life\.js/);
assert.match(tickets, /havkar-camera-catalog\.js/);
assert.match(tickets, /HAVKAR_TRAVEL_LIFE/);
assert.match(tickets, /133 currencies \+ XLM/);

// Personal trip lifecycle API
assert.match(life, /startPersonalTrip/);
assert.match(life, /pauseTrip/);
assert.match(life, /resumeTrip/);
assert.match(life, /stopTrip/);
assert.match(life, /indexedDB/);
assert.match(life, /HAVKAR_GEO_CONSENT/);
assert.match(life, /Screen-off|screen off/i);
assert.match(life, /uploadTripMedia/);
assert.match(life, /saveReminderPrefs/);
assert.match(life, /user_id: uid/);

// Migration RLS owner-only, no staff bypass
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.user_trips/);
assert.match(migration, /trip_track_points/);
assert.match(migration, /trip_albums/);
assert.match(migration, /trip_media/);
assert.match(migration, /user_reminder_prefs/);
assert.match(migration, /user_saved_places/);
assert.match(migration, /user_saved_cameras/);
assert.match(migration, /travel-media/);
assert.match(migration, /user_id = auth\.uid\(\)/);
assert.doesNotMatch(migration, /is_admin|staff_read|service_role_bypass_trips/i);
assert.match(migration, /No staff read policy/i);

// Camera honesty
assert.match(catalog, /singapore-lta/);
assert.match(catalog, /never labeled LIVE/i);
assert.match(tickets, /Periodic JPEG ≠ LIVE|JPEG ≠ LIVE/);

// Home tiles unchanged (15 menu-items with tile labels)
const tiles = indexHtml.match(/class="menu-item"/g) || [];
assert.ok(tiles.length >= 15, "expected at least 15 home tiles");
assert.match(indexHtml, /data-i18n="tickets"/);

// Partners honesty — no invented affiliate binding
const omio = omioConfigured({});
assert.equal(omio.affiliate_id_present, false);
assert.equal(omio.live_search, false);
assert.match(report, /OMIO_AFFILIATE_ID/);
assert.match(report, /7763968/);

const duffel = classifyDuffelAccessToken({});
assert.ok(duffel.mode === "missing" || duffel.live_orders_possible !== true);

// Currencies / fees not reinvented as marketplace cut on travel
assert.match(tickets, /Marketplace 5%/);
assert.doesNotMatch(tickets, /application_fee.*0\.05.*flight/i);

// Report completeness
assert.match(report, /✅/);
assert.match(report, /🟡/);
assert.match(report, /🔴/);
assert.match(report, /Owner actions required/);
assert.match(report, /1 000|1000|1,000/);

console.log("TICKETS_TRAVEL_LIFE_PLATFORM_TEST_OK");
