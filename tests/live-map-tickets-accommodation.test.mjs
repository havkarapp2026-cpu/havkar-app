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

test("tickets and accommodation expose four map modes including live", () => {
  const tickets = read("tickets.html");
  assert.match(tickets, /data-tickets-layer="street"/);
  assert.match(tickets, /data-tickets-layer="satellite"/);
  assert.match(tickets, /data-tickets-layer="hybrid"/);
  assert.match(tickets, /data-tickets-layer="live"/);
  assert.match(tickets, /ticketsLiveMeta/);

  const hotels = read("accommodation.html");
  assert.match(hotels, /data-acc-layer="street"/);
  assert.match(hotels, /data-acc-layer="satellite"/);
  assert.match(hotels, /data-acc-layer="hybrid"/);
  assert.match(hotels, /data-acc-layer="live"/);
  assert.match(hotels, /accLiveMeta/);
  assert.match(hotels, /fetchLiveRadarFrame/);
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
    assert.doesNotMatch(html, /data-tickets-layer="live"|data-acc-layer="live"/);
  }
});

test("service worker bumped for live map release", () => {
  const sw = read("sw.js");
  const reg = read("havkar-sw-register.js");
  assert.match(sw, /havkar-sw-20261117-live-map-tickets-accommodation-v1/);
  assert.match(reg, /havkar-sw-20261117-live-map-tickets-accommodation-v1/);
});
