import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("hotel surroundings UI wires Accommodation listings", () => {
  assert.equal(fs.existsSync(path.join(root, "havkar-hotel-surroundings.js")), true);
  assert.equal(fs.existsSync(path.join(root, "havkar-hotel-surroundings.css")), true);
  const hotels = read("accommodation.html");
  assert.match(hotels, /havkar-hotel-surroundings\.js/);
  assert.match(hotels, /HAVKAR_HOTEL_SURROUNDINGS/);
  assert.match(hotels, /View surroundings|attachListingButton/);
  assert.match(read("havkar-hotel-surroundings.js"), /View surroundings/);
  assert.match(read("havkar-hotel-surroundings.js"), /map-nearby-surroundings/);
  assert.match(read("havkar-hotel-surroundings.js"), /street_view/);
  assert.doesNotMatch(
    read("havkar-hotel-surroundings.js"),
    /showFakePanorama|invented panorama|synthetic.?street.?view/i
  );
});

test("nearby surroundings + street view APIs are routed without new serverless files", () => {
  const vercel = read("vercel.json");
  assert.match(vercel, /map-nearby-surroundings/);
  assert.match(vercel, /map-street-view/);
  assert.match(read("api/create-event-checkout.js"), /nearby_surroundings/);
  assert.match(read("api/create-event-checkout.js"), /street_view/);
  assert.equal(fs.existsSync(path.join(root, "api/map-nearby-surroundings.js")), false);
  assert.equal(fs.existsSync(path.join(root, "api/map-street-view.js")), false);
});

test("street view handler stays honest without keys", async () => {
  const { default: handler } = await import("../lib/map-street-view.mjs");
  const out = { statusCode: 0, body: null };
  const res = {
    setHeader() {},
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(body) {
      out.body = body;
      return this;
    }
  };
  await handler({ method: "GET", query: {} }, res);
  assert.equal(out.statusCode, 200);
  assert.equal(out.body.ok, true);
  assert.equal(out.body.interactive_360, false);
  assert.equal(out.body.armed, false);
  assert.match(String(out.body.reason || ""), /No Google Street View|not armed|Mapillary/i);
});

test("live videos support location radius search and distance fields", async () => {
  const { default: handler } = await import("../lib/map-live-videos.mjs");
  const out = { statusCode: 0, body: null };
  const res = {
    setHeader() {},
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(body) {
      out.body = body;
      return this;
    }
  };
  await handler(
    {
      method: "GET",
      query: { lat: "41.9", lng: "12.5", radius_km: "50", limit: "10" }
    },
    res
  );
  assert.equal(out.statusCode, 200);
  assert.equal(out.body.ok, true);
  assert.equal(out.body.search.mode, "location_radius");
  assert.ok(out.body.count >= 1);
  assert.ok(out.body.cameras[0].distance_km != null);
  assert.ok(
    out.body.cameras.every(function (c, i, arr) {
      return i === 0 || c.distance_km >= arr[i - 1].distance_km;
    })
  );
});

test("hotels_search maps listing coordinates fields", () => {
  const api = read("api/create-event-checkout.js");
  assert.match(api, /accommodation_addresses/);
  assert.match(api, /latitude:/);
  assert.match(api, /address_line/);
  assert.match(read("lib/duffel-stays.cjs"), /geographic_coordinates/);
});

test("pro toolbar autocomplete + nearby tools stay free; Maps Plus sales OFF; 15 tiles", () => {
  const toolbar = read("havkar-map-pro-toolbar.js");
  assert.match(toolbar, /typeahead=true/);
  assert.match(toolbar, /near-cams/);
  assert.match(toolbar, /street-view/);
  assert.match(toolbar, /View surroundings/);
  assert.match(read("lib/havkar-maps-plus.cjs"), /sales_enabled:\s*false/);
  assert.equal((read("index.html").match(/class="tile-label"/g) || []).length, 15);
  assert.match(read("sw.js"), /hotel-surroundings-v1/);
});

test("nearby surroundings handler returns structured payload for Rome", async () => {
  const { default: handler } = await import("../lib/map-nearby-surroundings.mjs");
  const out = { statusCode: 0, body: null };
  const res = {
    setHeader() {},
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(body) {
      out.body = body;
      return this;
    }
  };
  await handler(
    { method: "GET", query: { lat: "41.9028", lng: "12.4964", radius_km: "25" } },
    res
  );
  assert.equal(out.statusCode, 200);
  assert.equal(out.body.ok, true);
  assert.equal(out.body.free_for_users, true);
  assert.ok(Array.isArray(out.body.cameras));
  assert.ok(Array.isArray(out.body.photos));
  assert.equal(out.body.street_view.interactive_360, false);
  assert.ok(out.body.camera_count >= 1);
});
