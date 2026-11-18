import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("pro toolbar requests real browser geolocation with states and origin fill", () => {
  const toolbar = read("havkar-map-pro-toolbar.js");
  assert.match(toolbar, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(toolbar, /maps\.msg_requesting_gps|Requesting browser location permission/);
  assert.match(toolbar, /gpsErrorMessage/);
  assert.match(toolbar, /PERMISSION_DENIED|code === 1/);
  assert.match(toolbar, /code === 2/);
  assert.match(toolbar, /code === 3/);
  assert.match(toolbar, /placeGpsOnMap/);
  assert.match(toolbar, /havkar-gps-marker/);
  assert.match(toolbar, /applyGpsAsOrigin/);
  assert.match(toolbar, /data-pro": "gps-origin"/);
  assert.match(toolbar, /maps\.use_as_origin|Use as origin/);
  assert.match(toolbar, /Not uploaded to HAVKAR/);
  assert.match(toolbar, /maximumAge:\s*0/);
  assert.match(toolbar, /parseLatLngQuery/);
  assert.match(toolbar, /device_gps/);
  assert.doesNotMatch(toolbar, /fetch\([^)]*gps|POST[^;]*latitude/i);
});

test("havkar-map requestGps draws green marker and never claims server upload", () => {
  const map = read("havkar-map.js");
  assert.match(map, /requestGps:\s*function/);
  assert.match(map, /havkar-gps-marker/);
  assert.match(map, /shared_with_server:\s*false/);
  assert.match(map, /Not uploaded to HAVKAR servers/);
  assert.match(map, /maximumAge:\s*0/);
});

test("GPS marker CSS uses HAVKAR green pulse", () => {
  const css = read("havkar-map-pro.css");
  assert.match(css, /\.havkar-gps-dot/);
  assert.match(css, /havkar-gps-pulse/);
  assert.match(css, /--havkar-map-green/);
});

test("service worker bumped for GPS release and fifteen tiles unchanged", () => {
  assert.match(read("sw.js"), /map-final-dock-v1|live-cameras-restore-v1|map-gps-real-v1|havkar-sw-20261118/);
  assert.match(read("havkar-sw-register.js"), /map-final-dock-v1|live-cameras-restore-v1|map-gps-real-v1|havkar-sw-20261118/);
  const tiles = (read("index.html").match(/class="tile-label"/g) || []).length;
  assert.equal(tiles, 15);
  assert.match(read("tickets.html"), /havkar-map-pro-toolbar\.js/);
  assert.match(read("accommodation.html"), /havkar-map-pro-toolbar\.js/);
});

test("Maps Plus sales remain off and payments stay disarmed", () => {
  const plus = read("lib/havkar-maps-plus.cjs");
  assert.match(plus, /sales_enabled:\s*false/);
  assert.match(plus, /checkout_enabled:\s*false/);
});
