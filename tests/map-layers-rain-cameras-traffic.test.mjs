import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function mockRes() {
  const out = { statusCode: 0, body: null, headers: {} };
  return {
    out,
    setHeader(k, v) {
      out.headers[k] = v;
    },
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(body) {
      out.body = body;
      return this;
    },
    send(buf) {
      out.body = buf;
      return this;
    }
  };
}

test("licensed camera API rejects client stream injection and commercialOk=false", () => {
  const src = read("lib/map-public-cameras.mjs");
  assert.match(src, /Never accepts client-supplied stream URLs/);
  assert.match(src, /commercialOk !== true/);
  assert.match(src, /singapore-lta/);
  assert.match(src, /DATUMFEED_COMMERCIAL/);
  assert.match(src, /Caltrans/);
});

test("traffic API never returns TomTom key to client", () => {
  const src = read("lib/map-traffic.mjs");
  assert.match(src, /never returned to the browser/);
  assert.match(src, /HAVKAR_TOMTOM_API_KEY/);
  assert.doesNotMatch(src, /tile_url_template:.*key=/);
});

test("map layer routes stay under Hobby function limit via create-event-checkout", () => {
  const vercel = read("vercel.json");
  const checkout = read("api/create-event-checkout.js");
  assert.match(vercel, /\/api\/map-rain-radar/);
  assert.match(vercel, /havkarAction=mapRainRadar/);
  assert.match(vercel, /\/api\/map-public-cameras/);
  assert.match(vercel, /havkarAction=mapPublicCameras/);
  assert.match(vercel, /\/api\/map-traffic/);
  assert.match(vercel, /havkarAction=mapTraffic/);
  assert.match(checkout, /isMapLayersRequest/);
  assert.match(checkout, /map-rain-radar\.mjs/);
  assert.equal(fs.existsSync(path.join(root, "api/map-rain-radar.js")), false);
  assert.equal(fs.existsSync(path.join(root, "api/map-public-cameras.js")), false);
  assert.equal(fs.existsSync(path.join(root, "api/map-traffic.js")), false);
});

test("rain radar API returns frames and legend from RainViewer", async () => {
  const { default: handler } = await import("../lib/map-rain-radar.mjs");
  const res = mockRes();
  await handler({ method: "GET", query: {} }, res);
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.body.ok, true);
  assert.equal(res.out.body.available, true);
  assert.ok(Array.isArray(res.out.body.frames) && res.out.body.frames.length > 0);
  assert.ok(Array.isArray(res.out.body.legend));
  assert.match(String(res.out.body.source), /RainViewer/);
});

test("public cameras return Singapore LTA feeds inside SG bbox", async () => {
  const { default: handler } = await import("../lib/map-public-cameras.mjs");
  const res = mockRes();
  await handler(
    { method: "GET", query: { bbox: "103.6,1.2,104.1,1.5", kind: "intersection", limit: "20" } },
    res
  );
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.body.ok, true);
  assert.ok(res.out.body.count > 0);
  assert.ok(res.out.body.cameras.every((c) => c.commercial_ok === true));
  assert.ok(
    res.out.body.cameras.every((c) => String(c.image_url || "").startsWith("https://"))
  );
});

test("traffic status is gated without TomTom owner key", async () => {
  const prev = process.env.TOMTOM_API_KEY;
  const prevH = process.env.HAVKAR_TOMTOM_API_KEY;
  delete process.env.TOMTOM_API_KEY;
  delete process.env.HAVKAR_TOMTOM_API_KEY;
  try {
    const { default: handler } = await import("../lib/map-traffic.mjs?" + Date.now());
    const res = mockRes();
    await handler({ method: "GET", query: {} }, res);
    assert.equal(res.out.statusCode, 200);
    assert.equal(res.out.body.available, false);
    assert.match(String(res.out.body.message || ""), /HAVKAR_TOMTOM_API_KEY/);
  } finally {
    if (prev != null) process.env.TOMTOM_API_KEY = prev;
    else delete process.env.TOMTOM_API_KEY;
    if (prevH != null) process.env.HAVKAR_TOMTOM_API_KEY = prevH;
    else delete process.env.HAVKAR_TOMTOM_API_KEY;
  }
});
