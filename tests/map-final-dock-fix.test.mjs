/**
 * Final map UX: surroundings docked below map (never overlay),
 * trip save confirmation, sanitized public copy, health stays map-free.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("surroundings CSS docks below map — not fixed overlay", () => {
  const css = read("havkar-hotel-surroundings.css");
  assert.match(css, /position:\s*relative/);
  assert.doesNotMatch(css, /position:\s*fixed/);
  assert.match(css, /havkar-surroundings-summary/);
  assert.match(css, /is-collapsed/);
  assert.match(css, /max-height:\s*min\(55vh/);
});

test("surroundings JS builds collapsible docked panel", () => {
  const js = read("havkar-hotel-surroundings.js");
  assert.match(js, /havkar-surroundings-summary/);
  assert.match(js, /is-collapsed/);
  assert.match(js, /publicSafeText/);
  assert.match(js, /msg_trip_stop_saved|confirmTripAdd/);
  assert.match(js, /msg_360_not_configured/);
  assert.doesNotMatch(js, /position:\s*fixed/);
});

test("trip planner has i18n helpers and persists stops locally", () => {
  const trip = read("havkar-trip-planner.js");
  assert.match(trip, /function mt\(/);
  assert.match(trip, /function mapDir\(/);
  assert.match(trip, /STORAGE_KEY\s*=\s*"havkar_trip_plan_v1"/);
  assert.match(trip, /localStorage\.setItem/);
  assert.match(trip, /msg_trip_saved_device/);
  assert.match(trip, /msg_trip_stop_saved/);
  assert.match(trip, /function onLang\(\)\s*\{\s*render\(\);\s*\}/);
});

test("Tickets and Accommodation keep map above surroundings panel", () => {
  const tickets = read("tickets.html");
  const acc = read("accommodation.html");
  const tMap = tickets.indexOf("ticketsMapShell");
  const tSurr = tickets.indexOf("havkarSurroundingsPanel");
  const aMap = acc.indexOf("accMapShell");
  const aSurr = acc.indexOf("havkarSurroundingsPanel");
  assert.ok(tMap > 0 && tSurr > tMap, "tickets map before surroundings");
  assert.ok(aMap > 0 && aSurr > aMap, "accommodation map before surroundings");
  assert.match(tickets, /min-height:320px|min-height:300px|58vh|52vh/);
});

test("health page still has no interactive map", () => {
  const health = read("health.html");
  assert.doesNotMatch(health, /havkar-map-shell|leaflet\.js|havkar-map-pro-toolbar/i);
});

test("live layers do not print secret env names in traffic/camera status", () => {
  const layers = read("havkar-map-live-layers.js");
  assert.doesNotMatch(layers, /HAVKAR_TOMTOM_API_KEY required/);
  assert.doesNotMatch(layers, /Owner can add HAVKAR_YOUTUBE_API_KEY/);
  assert.match(layers, /maps\.cam_state_exists_no_play/);
});

test("traffic badge formats clock instead of raw ISO", () => {
  const toolbar = read("havkar-map-pro-toolbar.js");
  assert.match(toolbar, /function formatPublicClock/);
  assert.match(toolbar, /toLocaleTimeString/);
  assert.doesNotMatch(
    toolbar,
    /badge_traffic_on"\) \+ \(ts \? " · " \+ ts/
  );
});

test("Maps Plus / payments remain OFF", () => {
  const plus = read("lib/havkar-maps-plus.cjs");
  assert.match(plus, /sales_enabled:\s*false/);
  assert.match(plus, /billing_enabled:\s*false/);
});

test("service worker bumped for map-final dock", () => {
  assert.match(read("sw.js"), /map-final-dock-v1/);
  assert.match(read("havkar-sw-register.js"), /map-final-dock-v1/);
});

test("i18n packs include new dock/trip/360 keys", () => {
  const i18n = read("havkar-map-i18n.js");
  for (const key of [
    "maps.collapse_surroundings",
    "maps.msg_trip_stop_saved",
    "maps.msg_trip_saved_device",
    "maps.msg_360_not_configured",
    "maps.msg_no_pois_radius",
    "maps.msg_guide_unavailable",
    "maps.source_label"
  ]) {
    assert.match(i18n, new RegExp('"' + key.replace(/\./g, "\\.") + '"'));
    assert.match(i18n, new RegExp(key.replace(/\./g, "\\.") + "[\\s\\S]*?fa:"));
  }
});
