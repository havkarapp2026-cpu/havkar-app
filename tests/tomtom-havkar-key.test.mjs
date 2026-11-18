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

test("code prefers HAVKAR_TOMTOM_API_KEY over legacy TOMTOM_API_KEY", () => {
  const keySrc = read("lib/tomtom-key.cjs");
  const traffic = read("lib/map-traffic.mjs");
  assert.match(keySrc, /HAVKAR_TOMTOM_API_KEY/);
  assert.match(traffic, /HAVKAR_TOMTOM_API_KEY/);
  assert.match(traffic, /never returned to the browser/);
  assert.doesNotMatch(traffic, /tile_url_template:.*key=/);
});

test("map search/routing rewrites stay under create-event-checkout", () => {
  const vercel = read("vercel.json");
  const checkout = read("api/create-event-checkout.js");
  assert.match(vercel, /\/api\/map-tomtom-search/);
  assert.match(vercel, /\/api\/map-tomtom-routing/);
  assert.match(checkout, /mapTomTomSearch/);
  assert.match(checkout, /mapTomTomRouting/);
  assert.match(checkout, /map-tomtom-search\.mjs/);
  assert.match(checkout, /map-tomtom-routing\.mjs/);
});

test("traffic gated without either TomTom env name", async () => {
  const prevH = process.env.HAVKAR_TOMTOM_API_KEY;
  const prevT = process.env.TOMTOM_API_KEY;
  delete process.env.HAVKAR_TOMTOM_API_KEY;
  delete process.env.TOMTOM_API_KEY;
  try {
    const { default: handler } = await import("../lib/map-traffic.mjs?" + Date.now());
    const res = mockRes();
    await handler({ method: "GET", query: {} }, res);
    assert.equal(res.out.statusCode, 200);
    assert.equal(res.out.body.available, false);
    assert.match(String(res.out.body.requires_owner_secret || ""), /HAVKAR_TOMTOM_API_KEY/);
  } finally {
    if (prevH != null) process.env.HAVKAR_TOMTOM_API_KEY = prevH;
    else delete process.env.HAVKAR_TOMTOM_API_KEY;
    if (prevT != null) process.env.TOMTOM_API_KEY = prevT;
    else delete process.env.TOMTOM_API_KEY;
  }
});

test("traffic enables with HAVKAR_TOMTOM_API_KEY without exposing key", async () => {
  const prevH = process.env.HAVKAR_TOMTOM_API_KEY;
  const prevT = process.env.TOMTOM_API_KEY;
  process.env.HAVKAR_TOMTOM_API_KEY = "test-key-not-real";
  delete process.env.TOMTOM_API_KEY;
  try {
    const { default: handler } = await import("../lib/map-traffic.mjs?" + Date.now() + "b");
    const res = mockRes();
    await handler({ method: "GET", query: {} }, res);
    assert.equal(res.out.statusCode, 200);
    assert.equal(res.out.body.available, true);
    assert.match(String(res.out.body.tile_url_template || ""), /\/api\/map-traffic/);
    assert.doesNotMatch(JSON.stringify(res.out.body), /test-key-not-real/);
    assert.ok(res.out.body.incidents_tile_url_template);
    assert.ok(res.out.body.last_updated || res.out.body.fetched_at);
  } finally {
    if (prevH != null) process.env.HAVKAR_TOMTOM_API_KEY = prevH;
    else delete process.env.HAVKAR_TOMTOM_API_KEY;
    if (prevT != null) process.env.TOMTOM_API_KEY = prevT;
    else delete process.env.TOMTOM_API_KEY;
  }
});

test("tickets and accommodation keep map tooling; other modules stay map-removed policy", () => {
  const tickets = read("tickets.html");
  const hotels = read("accommodation.html");
  assert.match(tickets, /havkar-map-live-layers\.js/);
  assert.match(hotels, /havkar-map-live-layers\.js/);
  assert.match(tickets, /ticketsShareLocationBtn/);
  assert.match(hotels, /accShareLocationBtn/);
  assert.match(read("havkar-map.js"), /map-tomtom-search/);
  assert.match(read("havkar-map.js"), /map-tomtom-routing/);
});
