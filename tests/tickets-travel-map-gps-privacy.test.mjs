import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadTravelLife() {
  const ctx = { console, setTimeout, clearTimeout };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("havkar-travel-life.js", "utf8"), ctx);
  return ctx.HAVKAR_TRAVEL_LIFE;
}

function loadI18n() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("havkar-travel-life-i18n.js", "utf8"), ctx);
  return ctx.HAVKAR_TRAVEL_I18N;
}

test("Show on map uses travelMapPanel (not missing ticketsMapPanel)", () => {
  const html = fs.readFileSync("tickets.html", "utf8");
  assert.match(html, /id="travelMapPanel"/);
  assert.match(html, /getElementById\('travelMapPanel'\)/);
  assert.equal(html.includes("ticketsMapPanel"), false);
  assert.match(html, /__havkarTicketsDrawTrack/);
  assert.match(html, /noTrackPoints|No GPS coordinates/);
  assert.match(html, /Do NOT call getCurrentPosition\/requestGps on every tick/);
});

test("empty track honesty — no invented route from place names", () => {
  const TL = loadTravelLife();
  const empty = TL.summarizeTrack([]);
  assert.equal(empty.has_coordinates, false);
  assert.equal(empty.point_count, 0);
  assert.match(empty.honesty, /does not invent/i);
  assert.deepEqual(TL.validTrackPoints([{ lat: 999, lng: 1 }, { lat: null, lng: 2 }, { lat: 1, lng: 2 }]), [
    { lat: 1, lng: 2 }
  ]);
});

test("track summary computes distance duration and speed from GPS samples", () => {
  const TL = loadTravelLife();
  const sum = TL.summarizeTrack([
    { lat: 41.9, lng: 12.5, recorded_at: "2026-01-01T10:00:00Z", speed_mps: 10 },
    { lat: 41.91, lng: 12.51, recorded_at: "2026-01-01T10:10:00Z", speed_mps: 12 }
  ]);
  assert.equal(sum.has_coordinates, true);
  assert.equal(sum.point_count, 2);
  assert.ok(sum.distance_m > 1000);
  assert.equal(sum.duration_s, 600);
  assert.equal(sum.avg_speed_mps, 11);
  assert.equal(sum.max_speed_mps, 12);
});

test("trip action buttons and trip info are wired with i18n keys", () => {
  const html = fs.readFileSync("tickets.html", "utf8");
  assert.match(html, /showTripInfo/);
  assert.match(html, /travelT\('rename'/);
  assert.match(html, /travelT\('delete'/);
  assert.match(html, /travelT\('useForMemories'/);
  assert.match(html, /travelT\('showOnMap'/);
  assert.match(html, /travelT\('shareTrip'/);
  assert.match(html, /travelT\('revokeShare'/);
  assert.match(html, /travelT\('tripInfo'/);
  assert.match(html, /createShareLink/);
  assert.match(html, /revokeShare/);
});

test("travel life i18n covers 21 languages including new action keys", () => {
  const api = loadI18n();
  assert.equal(api.languages.length, 21);
  const required = [
    "showOnMap",
    "rename",
    "delete",
    "tripInfo",
    "noTrackPoints",
    "gpsAllowed",
    "useForMemories",
    "shareTrip",
    "revokeShare",
    "noCoordsHonesty"
  ];
  for (const lang of api.languages) {
    for (const key of required) {
      assert.ok(api.strings[lang][key], lang + "." + key);
    }
  }
});

test("GPS consent UI hides Accept after grant and surfaces browser permission state", () => {
  const html = fs.readFileSync("tickets.html", "utf8");
  assert.match(html, /accept\.hidden = !!allowed/);
  assert.match(html, /permissions\.query/);
  assert.match(html, /gpsBrowserGranted/);
  assert.match(html, /armGpsMarkerOnce/);
  const map = fs.readFileSync("havkar-map.js", "utf8");
  assert.match(map, /maximumAge:\s*30000/);
});

test("travel tables remain owner-only RLS with anon revoked", () => {
  const platform = fs.readFileSync(
    "supabase/migrations/20261125120000_travel_life_platform.sql",
    "utf8"
  );
  const revoke = fs.readFileSync(
    "supabase/migrations/20261125120430_travel_life_revoke_anon.sql",
    "utf8"
  );
  assert.match(platform, /ENABLE ROW LEVEL SECURITY/);
  assert.match(platform, /user_id = auth\.uid\(\)/);
  assert.match(platform, /trip track owner all/);
  assert.match(platform, /No staff read policy/);
  assert.match(revoke, /REVOKE ALL ON TABLE public\.user_trips FROM anon/);
  assert.match(revoke, /REVOKE ALL ON TABLE public\.trip_track_points FROM anon/);
  assert.match(revoke, /REVOKE ALL ON TABLE public\.trip_stops FROM anon/);
});

test("share resolve stays token-gated server-side", () => {
  const lib = fs.readFileSync("lib/travel-life-api.cjs", "utf8");
  assert.match(lib, /havkar_resolve_trip_share/);
  assert.match(lib, /p_token/);
  const shareHtml = fs.readFileSync("travel-share.html", "utf8");
  assert.match(shareHtml, /resolve_share/);
  assert.match(shareHtml, /Missing share token/);
});

test("Travel Plus free GPS preserved / sales still off", () => {
  const { travelPlusStatus } = require("../lib/havkar-travel-plus.cjs");
  const status = travelPlusStatus();
  assert.equal(status.sales_enabled, false);
  assert.equal(status.free_features_preserved, true);
});

console.log("TICKETS_TRAVEL_MAP_GPS_PRIVACY_TEST_OK");
