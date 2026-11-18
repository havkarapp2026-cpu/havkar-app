import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("shared smart travel APIs are routed without new serverless files", () => {
  const vercel = read("vercel.json");
  assert.match(vercel, /map-nearby-pois/);
  assert.match(vercel, /map-trip-plan/);
  assert.match(vercel, /map-travel-plus-status/);
  assert.match(vercel, /map-smart-guide/);
  const api = read("api/create-event-checkout.js");
  assert.match(api, /nearby_pois/);
  assert.match(api, /trip_plan/);
  assert.match(api, /travel_plus_status/);
  assert.match(api, /smart_guide/);
  assert.equal(fs.existsSync(path.join(root, "api/map-nearby-pois.js")), false);
  assert.equal(fs.existsSync(path.join(root, "api/map-trip-plan.js")), false);
});

test("TomTom search supports lat/lon/radius bias", () => {
  const src = read("lib/map-tomtom-search.mjs");
  assert.match(src, /&lat=/);
  assert.match(src, /&lon=/);
  assert.match(src, /&radius=/);
});

test("Travel Plus sales stay OFF and separate from health billing", () => {
  const plus = read("lib/havkar-travel-plus.cjs");
  assert.match(plus, /sales_enabled:\s*false/);
  assert.match(plus, /price_monthly:\s*4\.99/);
  assert.match(plus, /trial_days:\s*30/);
  assert.match(plus, /havkar_travel_plus/);
  assert.match(read("lib/havkar-maps-plus.cjs"), /sales_enabled:\s*false/);
});

test("trip planner UI wires Accommodation and Tickets; Health has no interactive map tile", () => {
  assert.equal(fs.existsSync(path.join(root, "havkar-trip-planner.js")), true);
  assert.equal(fs.existsSync(path.join(root, "havkar-trip-planner.css")), true);
  assert.match(read("accommodation.html"), /havkar-trip-planner\.js/);
  assert.match(read("accommodation.html"), /havkarTripPlanner/);
  assert.match(read("tickets.html"), /havkar-trip-planner\.js/);
  assert.match(read("tickets.html"), /HAVKAR_TRIP_PLANNER/);
  const health = read("health.html");
  assert.match(health, /map-nearby-pois/);
  assert.match(health, /healthNearBtn/);
  assert.doesNotMatch(health, /havkar-map-shell|leaflet\.js/i);
  assert.equal((read("index.html").match(/class="tile-label"/g) || []).length, 15);
  assert.match(read("sw.js"), /smart-travel-health-v1/);
});

test("hotel surroundings consumes POIs + smart guide + trip add", () => {
  const js = read("havkar-hotel-surroundings.js");
  assert.match(js, /renderPois|pois-list/);
  assert.match(js, /map-smart-guide/);
  assert.match(js, /Add to trip/);
  assert.match(js, /_havkarTripApi/);
});

test("nearby POIs handler returns structured empty-or-real payload", async () => {
  const { default: handler } = await import("../lib/map-nearby-pois.mjs?" + Date.now());
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
  await handler({ method: "GET", query: { lat: "45.4408", lng: "12.3155", radius_m: "2000", limit: "3" } }, res);
  assert.equal(out.statusCode, 200);
  assert.equal(out.body.free_for_users, true);
  assert.ok(Array.isArray(out.body.groups) || out.body.error === "tomtom_not_configured");
  if (out.body.ok && out.body.available) {
    assert.ok(out.body.places.every(function (p) {
      return Number.isFinite(p.latitude) && Number.isFinite(p.longitude);
    }));
    assert.match(String(out.body.provider), /tomtom/i);
  }
});

test("trip plan rejects fewer than two stops", async () => {
  const { default: handler } = await import("../lib/map-trip-plan.mjs?" + Date.now());
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
    { method: "POST", query: {}, body: { stops: [{ lat: 41.9, lng: 12.5, label: "A" }] } },
    res
  );
  assert.equal(out.statusCode, 400);
  assert.equal(out.body.error, "invalid_stops");
});

test("smart guide is rule-based and never claims paid LLM", async () => {
  const prev = process.env.HAVKAR_TOMTOM_API_KEY;
  delete process.env.HAVKAR_TOMTOM_API_KEY;
  delete process.env.TOMTOM_API_KEY;
  try {
    const { default: handler } = await import("../lib/map-smart-guide.mjs?" + Date.now());
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
    await handler({ method: "GET", query: { lat: "41.9028", lng: "12.4964", radius_m: "3000" } }, res);
    assert.equal(out.statusCode, 200);
    assert.equal(out.body.paid_llm, false);
    assert.equal(out.body.engine, "havkar_grounded_rules_v1");
    assert.ok(Array.isArray(out.body.limits));
    assert.ok(
      out.body.limits.some(function (l) {
        return /safety|quality|availability/i.test(l.detail || "");
      })
    );
    assert.equal(out.body.travel_plus.sales_enabled, false);
  } finally {
    if (prev != null) process.env.HAVKAR_TOMTOM_API_KEY = prev;
  }
});

test("travel plus status endpoint stays unarmed", async () => {
  const { default: handler } = await import("../lib/map-travel-plus-status.mjs?" + Date.now());
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
  await handler({ method: "GET" }, res);
  assert.equal(out.statusCode, 200);
  assert.equal(out.body.armed, false);
  assert.equal(out.body.user_chargeable, false);
  assert.equal(out.body.product.sales_enabled, false);
});

test("surroundings payload documents POI coverage field", () => {
  const src = read("lib/map-nearby-surroundings.mjs");
  assert.match(src, /loadNearbyPois|nearby-pois/);
  assert.match(src, /pois:/);
  assert.match(src, /TomTom POI/);
});
