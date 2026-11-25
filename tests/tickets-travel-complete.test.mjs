import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tickets = fs.readFileSync("tickets.html", "utf8");
const life = fs.readFileSync("havkar-travel-life.js", "utf8");
const i18n = fs.readFileSync("havkar-travel-life-i18n.js", "utf8");
const share = fs.readFileSync("travel-share.html", "utf8");
const api = fs.readFileSync("api/travel-life.js", "utf8");
const lib = fs.readFileSync("lib/travel-life-api.cjs", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20261125200000_travel_life_complete.sql",
  "utf8"
);
const android = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
const ios = fs.readFileSync("ios/HAVKAR/Info.plist", "utf8");
const catalog = fs.readFileSync("havkar-camera-catalog.js", "utf8");
const cameras = fs.readFileSync("lib/map-camera-sources.cjs", "utf8");
const indexHtml = fs.readFileSync("index.html", "utf8");

const { omioConfigured } = require("../lib/omio-adapter.cjs");
const { classifyDuffelAccessToken } = require("../lib/duffel-live-ready.cjs");
const { anniversaryMatch } = require("../lib/travel-life-api.cjs");

assert.match(tickets, /havkar-travel-life-i18n\.js/);
assert.match(tickets, /personalAddStopBtn/);
assert.match(tickets, /__havkarTicketsDrawTrack/);
assert.match(tickets, /createShareLink/);
assert.match(tickets, /cameraCatalogKind/);
assert.match(tickets, /myTripsMonthly/);
assert.match(tickets, /133 currencies \+ XLM/);

assert.match(life, /loadTrackPoints/);
assert.match(life, /createShareLink/);
assert.match(life, /by_month/);
assert.match(life, /addStop/);
assert.match(life, /nativeBackgroundReady/);

assert.match(i18n, /\bfa\s*:/);
assert.match(i18n, /\bckb\s*:/);
assert.match(i18n, /\bkmr\s*:/);
assert.match(i18n, /startTrip/);
const langs = [
  "en","fa","it","de","fr","es","pt","nl","sv","pl","id","zh","ja","ko","hi","ru","tr","ar","ur","ckb","kmr"
];
langs.forEach((l) => assert.match(i18n, new RegExp("\\b" + l + "\\s*:")));

assert.match(share, /resolve_share/);
assert.match(api, /dispatch_reminders/);
assert.match(lib, /RESEND_API_KEY/);
assert.match(lib, /travel_reminder_dispatch/);

assert.match(migration, /havkar_resolve_trip_share/);
assert.match(migration, /travel_reminder_dispatch/);
assert.match(migration, /share_include_geo/);
assert.doesNotMatch(migration, /DROP TABLE/);

assert.match(android, /ACCESS_BACKGROUND_LOCATION/);
assert.match(android, /FOREGROUND_SERVICE_LOCATION/);
assert.match(ios, /NSLocationAlwaysAndWhenInUseUsageDescription/);
assert.match(ios, /UIBackgroundModes/);
assert.match(ios, /<string>location<\/string>/);

assert.match(catalog, /playback/);
assert.match(catalog, /true_live_video/);
assert.match(cameras, /categories/);
assert.match(cameras, /periodic_jpeg/);

const tiles = indexHtml.match(/class="menu-item"/g) || [];
assert.ok(tiles.length >= 15);

const omio = omioConfigured({});
assert.equal(omio.live_search, false);
assert.equal(omio.affiliate_id_present, false);
const duffel = classifyDuffelAccessToken({});
assert.ok(duffel.live_orders_possible !== true);

const now = new Date(Date.UTC(2026, 10, 25));
assert.equal(anniversaryMatch("2025-11-25T12:00:00Z", now), true);
assert.equal(anniversaryMatch("2025-11-24T12:00:00Z", now), false);
assert.equal(anniversaryMatch("2026-11-25T12:00:00Z", now), false);

assert.doesNotMatch(tickets, /havkar_claim_event_seat/);
assert.match(tickets, /Events \(separate\)|Separate Events module/);

console.log("TICKETS_TRAVEL_COMPLETE_TEST_OK");
