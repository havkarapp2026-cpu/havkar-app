/**
 * Destination search must lock real TomTom coords, move the map,
 * place a marker, and drive surroundings/360 from that destination —
 * never from a silent Rome/default center.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("toolbar locks destination and never uses undefined map for street view", () => {
  const toolbar = read("havkar-map-pro-toolbar.js");
  assert.match(toolbar, /var lastDestination = null/);
  assert.match(toolbar, /function normalizePlace/);
  assert.match(toolbar, /function requireDestination/);
  assert.match(toolbar, /function openSurroundingsAtDestination/);
  assert.match(toolbar, /function placeDestinationMarker/);
  assert.match(toolbar, /api\/map-tomtom-search/);
  assert.doesNotMatch(toolbar, /var c = map && map\.getCenter/);
  assert.match(toolbar, /requireDestination\("streetview"\)/);
  assert.match(toolbar, /maps\.msg_move_search_first/);
  assert.match(toolbar, /maps\.msg_multi_matches/);
  assert.match(toolbar, /maps\.msg_place_ready/);
  assert.match(toolbar, /refreshDestinationTools/);
  /* Full search always hits TomTom proxy (no HAVKAR_MAP.geocode shortcut). */
  assert.doesNotMatch(
    toolbar,
    /if \(!typeahead && root\.HAVKAR_MAP && root\.HAVKAR_MAP\.geocode\)/
  );
});

test("accommodation city search uses same TomTom proxy as tickets toolbar", () => {
  const acc = read("accommodation.html");
  assert.match(acc, /api\/map-tomtom-search/);
  assert.match(acc, /havkar-map-pro-toolbar\.js/);
  assert.match(acc, /havkar-map-i18n\.js/);
  const tickets = read("tickets.html");
  assert.match(tickets, /havkar-map-pro-toolbar\.js/);
  assert.match(tickets, /havkar-map-i18n\.js/);
});

test("surroundings status and 360 titles are localized", () => {
  const surr = read("havkar-hotel-surroundings.js");
  assert.match(surr, /maps\.surr_status/);
  assert.match(surr, /maps\.sv_title_mapillary/);
  assert.match(surr, /maps\.sv_title_google/);
  assert.match(surr, /maps\.sv_help_mapillary/);
  assert.match(surr, /maps\.open_mapillary/);
  assert.doesNotMatch(surr, /"Open official Mapillary source"/);
  assert.doesNotMatch(
    surr,
    /"Google Maps Embed Street View · rotate and move when Google coverage exists/
  );
});

test("service worker bumped for destination search fix", () => {
  assert.match(read("sw.js"), /map-search-destination-v1/);
  assert.match(read("havkar-sw-register.js"), /map-search-destination-v1/);
});

test("TomTom search returns real coords for Rome, Bari, and non-EU sample", async () => {
  const queries = [
    { q: "Via del Corso 1, Rome", minLat: 41.8, maxLat: 42.0, minLng: 12.3, maxLng: 12.6 },
    { q: "Bari Centrale, Italy", minLat: 40.9, maxLat: 41.3, minLng: 16.7, maxLng: 17.1 },
    { q: "Times Square, New York", minLat: 40.7, maxLat: 40.8, minLng: -74.1, maxLng: -73.9 }
  ];
  for (const sample of queries) {
    const url =
      "https://havkar.online/api/map-tomtom-search?q=" +
      encodeURIComponent(sample.q) +
      "&limit=5";
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    assert.equal(res.ok, true, sample.q + " http");
    const body = await res.json();
    assert.equal(body.ok, true, sample.q + " ok");
    assert.ok(body.primary, sample.q + " primary");
    assert.ok(Number.isFinite(body.primary.latitude), sample.q + " lat");
    assert.ok(Number.isFinite(body.primary.longitude), sample.q + " lng");
    assert.ok(body.primary.latitude >= sample.minLat && body.primary.latitude <= sample.maxLat, sample.q + " lat range");
    assert.ok(body.primary.longitude >= sample.minLng && body.primary.longitude <= sample.maxLng, sample.q + " lng range");
    assert.ok(Array.isArray(body.results) && body.results.length >= 1, sample.q + " results");
  }
});

test("Maps Plus sales remain OFF", () => {
  const plus = read("lib/havkar-maps-plus.cjs");
  assert.match(plus, /sales_enabled:\s*false/);
  assert.match(plus, /billing_enabled:\s*false/);
});
