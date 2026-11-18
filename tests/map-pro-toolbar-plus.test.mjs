import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("pro toolbar exists and wires tickets + accommodation", () => {
  assert.equal(fs.existsSync(path.join(root, "havkar-map-pro-toolbar.js")), true);
  assert.equal(fs.existsSync(path.join(root, "havkar-map-pro.css")), true);
  const tickets = read("tickets.html");
  const hotels = read("accommodation.html");
  assert.match(tickets, /havkar-map-pro-toolbar\.js/);
  assert.match(hotels, /havkar-map-pro-toolbar\.js/);
  assert.match(tickets, /ticketsProToolbarHost/);
  assert.match(hotels, /accProToolbarHost/);
  assert.match(read("havkar-map-pro-toolbar.js"), /Fullscreen/);
  assert.match(read("havkar-map-pro-toolbar.js"), /My location/);
  assert.match(read("havkar-map-pro-toolbar.js"), /map-tomtom-routing/);
  assert.match(read("havkar-map-pro-toolbar.js"), /sales OFF/);
});

test("Maps Plus scaffold is sales-disabled", () => {
  const plus = read("lib/havkar-maps-plus.cjs");
  assert.match(plus, /price_monthly:\s*4\.99/);
  assert.match(plus, /trial_days:\s*30/);
  assert.match(plus, /sales_enabled:\s*false/);
  assert.match(plus, /billing_enabled:\s*false/);
  assert.match(plus, /auto_renew_enabled:\s*false/);
  assert.match(plus, /checkout_enabled:\s*false/);
  const vercel = read("vercel.json");
  assert.match(vercel, /map-maps-plus-status/);
});

test("TomTom cost guards exist for search/routing/traffic", () => {
  const guard = read("lib/tomtom-guard.cjs");
  assert.match(guard, /rateLimit/);
  assert.match(guard, /SEARCH_PER_MIN/);
  assert.match(guard, /ROUTE_PER_MIN/);
  assert.match(read("lib/map-tomtom-search.mjs"), /tomtom-guard/);
  assert.match(read("lib/map-tomtom-routing.mjs"), /tomtom-guard/);
  assert.match(read("lib/map-traffic.mjs"), /tomtom-guard/);
});

test("home still has exactly fifteen tile labels and maps stay tickets/hotels scoped", () => {
  const home = read("index.html");
  const tiles = (home.match(/class="tile-label"/g) || []).length;
  assert.equal(tiles, 15);
  assert.doesNotMatch(read("delivery.html"), /havkar-map-pro-toolbar/);
  assert.doesNotMatch(read("ads.html"), /havkar-map-pro-toolbar/);
});

test("maps plus status handler returns disarmed product", async () => {
  const { default: handler } = await import("../lib/map-maps-plus-status.mjs");
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
  await handler({ method: "GET" }, res);
  assert.equal(out.statusCode, 200);
  assert.equal(out.body.ok, true);
  assert.equal(out.body.armed, false);
  assert.equal(out.body.product.sales_enabled, false);
  assert.equal(out.body.product.price_monthly, 4.99);
});
