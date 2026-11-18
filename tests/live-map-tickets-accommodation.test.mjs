import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("havkar-map exposes RainViewer live radar helper with honest metadata", () => {
  const src = read("havkar-map.js");
  assert.match(src, /api\.rainviewer\.com\/public\/weather-maps\.json/);
  assert.match(src, /fetchLiveRadarFrame/);
  assert.match(src, /setLiveLayer/);
  assert.match(src, /Live broadcast is not available/);
  assert.match(src, /safeAttributionPrefix/);
  assert.match(src, /setPrefix\("Leaflet"\)/);
  assert.match(src, /avoid a homepage hyperlink/);
});

test("tickets and accommodation use eight-option live layer menu", () => {
  const tickets = read("tickets.html");
  assert.match(tickets, /havkar-map-live-layers\.js/);
  assert.match(tickets, /ticketsLayerMenuHost/);
  assert.match(tickets, /HAVKAR_MAP_LIVE_LAYERS/);
  assert.doesNotMatch(tickets, /data-tickets-layer=/);

  const hotels = read("accommodation.html");
  assert.match(hotels, /havkar-map-live-layers\.js/);
  assert.match(hotels, /accLayerMenuHost/);
  assert.match(hotels, /HAVKAR_MAP_LIVE_LAYERS/);
  assert.doesNotMatch(hotels, /data-acc-layer=/);

  const layers = read("havkar-map-live-layers.js");
  for (const label of [
    "Street map",
    "Satellite",
    "Hybrid",
    "Live map",
    "Rain radar",
    "Live cameras",
    "Intersection cameras",
    "Traffic status"
  ]) {
    assert.match(layers, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(layers, /data-rain="play"/);
  assert.match(layers, /data-rain="pause"/);
  assert.match(layers, /\/api\/map-rain-radar/);
  assert.match(layers, /\/api\/map-public-cameras/);
  assert.match(layers, /\/api\/map-traffic/);
});

test("non-travel modules still do not load map stacks", () => {
  for (const file of [
    "buy-sell.html",
    "jobs.html",
    "services.html",
    "ads.html",
    "delivery.html",
    "health.html"
  ]) {
    const html = read(file);
    assert.doesNotMatch(html, /havkar-module-map\.js/);
    assert.doesNotMatch(html, /havkar-map-live-layers\.js/);
    assert.doesNotMatch(html, /data-tickets-layer="live"|data-acc-layer="live"/);
  }
});

test("service worker bumped for map layers release", () => {
  const sw = read("sw.js");
  const reg = read("havkar-sw-register.js");
  assert.match(sw, /havkar-sw-20261118-live-cameras-global-v1/);
  assert.match(reg, /havkar-sw-20261118-live-cameras-global-v1/);
});
