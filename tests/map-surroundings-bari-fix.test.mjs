import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("public UI never prints Mapillary/Google secret env names", () => {
  assert.doesNotMatch(read("havkar-hotel-surroundings.js"), /Add free HAVKAR_MAPILLARY/);
  assert.match(read("havkar-hotel-surroundings.js"), /maps\.widen_360|Widen 360/);
  assert.match(read("havkar-hotel-surroundings.js"), /nearest_live_camera/);
  assert.match(read("havkar-hotel-surroundings.js"), /user_message/);
  assert.doesNotMatch(read("havkar-map-pro-toolbar.js"), /Add free HAVKAR_MAPILLARY/);
  assert.match(read("havkar-map-pro-toolbar.js"), /expand=1/);
});

test("street view progressive expand raises former 50 m hard cap", () => {
  const src = read("lib/map-street-view.mjs");
  assert.match(src, /fetchMapillaryProgressive/);
  assert.match(src, /1000/);
  assert.match(src, /failure_kind/);
  assert.match(src, /user_message/);
  assert.doesNotMatch(src, /Math\.min\(Math\.max\(Number\(radiusM\) \|\| 50, 5\), 50\)/);
});

test("surroundings returns nearest LIVE outside radius + diagnosis", () => {
  const src = read("lib/map-nearby-surroundings.mjs");
  assert.match(src, /nearest_live_camera/);
  assert.match(src, /diagnosis/);
  assert.match(src, /expand:\s*"1"/);
  assert.doesNotMatch(
    src,
    /HAVKAR_MAPILLARY_ACCESS_TOKEN\) first, then optional Google Maps Embed/
  );
});

test("TomTom POI uses categorySet for transit/pharmacy/hospital", () => {
  const src = read("lib/map-nearby-pois.mjs");
  assert.match(src, /categorySet/);
  assert.match(src, /categorySearch/);
  assert.match(src, /7380/);
  assert.match(src, /failure_kind:\s*"missing_key"/);
  assert.doesNotMatch(src, /requires_owner_secret:\s*"HAVKAR_TOMTOM_API_KEY"/);
});

test("street view handler progressive + public messages without secrets", async () => {
  const prev = process.env.HAVKAR_MAPILLARY_ACCESS_TOKEN;
  delete process.env.HAVKAR_MAPILLARY_ACCESS_TOKEN;
  delete process.env.MAPILLARY_ACCESS_TOKEN;
  try {
    const { default: handler } = await import("../lib/map-street-view.mjs?" + Date.now());
    const out = { statusCode: 0, body: null };
    const res = {
      setHeader() {},
      status(code) {
        out.statusCode = code;
        return this;
      },
      json(body) {
        out.body = body;
      }
    };
    await handler(
      { method: "GET", query: { lat: "41.1171", lng: "16.8719", expand: "1" } },
      res
    );
    assert.equal(out.body.failure_kind, "missing_key");
    assert.ok(out.body.user_message);
    assert.doesNotMatch(out.body.user_message, /HAVKAR_|MAPILLARY_ACCESS_TOKEN/);
    assert.equal(out.body.required_secrets, undefined);
  } finally {
    if (prev != null) process.env.HAVKAR_MAPILLARY_ACCESS_TOKEN = prev;
  }
});

test("health page keeps shared POI link and no interactive map", () => {
  const health = read("health.html");
  assert.match(health, /map-nearby-pois|healthNearBtn/);
  assert.doesNotMatch(health, /leaflet\.js|havkar-map-shell/i);
  assert.equal((read("index.html").match(/class="tile-label"/g) || []).length, 15);
  assert.match(read("sw.js"), /map-final-dock-v1|live-cameras-restore-v1|map-search-destination-v1|map-i18n-complete-v1|map-surroundings-bari-v1/);
});
