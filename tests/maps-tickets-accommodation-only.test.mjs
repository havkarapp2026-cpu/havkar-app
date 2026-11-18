import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const KEEP = ["tickets.html", "accommodation.html"];
const REMOVE = [
  "buy-sell.html",
  "jobs.html",
  "services.html",
  "ads.html",
  "delivery.html",
  "health.html"
];

test("tickets and accommodation still reference map / leaflet / module-map", () => {
  const tickets = read("tickets.html");
  assert.match(tickets, /havkar-map\.js/);
  assert.match(tickets, /havkar-module-map\.js/);
  assert.match(tickets, /travelMapPanel|ticketsMapHost|HAVKAR_MAP/);
  assert.match(tickets, /havkar-map-live-layers\.js/);
  assert.match(tickets, /ticketsLayerMenuHost/);
  assert.match(tickets, /ticketsShareLocationBtn/);
  assert.match(tickets, /ticketsCopyLocationBtn/);

  const hotels = read("accommodation.html");
  assert.match(hotels, /havkar-map\.js/);
  assert.match(hotels, /leaflet@1\.9\.4/);
  assert.match(hotels, /L\.map\(/);
  assert.match(hotels, /havkar-map-live-layers\.js/);
  assert.match(hotels, /accLayerMenuHost/);
  assert.match(hotels, /accShareLocationBtn/);
  assert.match(hotels, /accCopyLocationBtn/);
});

test("non-travel modules do not load module-map or mount moduleMapPanel", () => {
  for (const file of REMOVE) {
    const html = read(file);
    assert.doesNotMatch(
      html,
      /havkar-module-map\.js/,
      `${file} must not include havkar-module-map.js`
    );
    assert.doesNotMatch(
      html,
      /id=["']moduleMapPanel["']/,
      `${file} must not contain moduleMapPanel`
    );
    assert.doesNotMatch(
      html,
      /HAVKAR_MODULE_MAP\.mount\s*\(/,
      `${file} must not call HAVKAR_MODULE_MAP.mount`
    );
  }
});

test("buy-sell jobs services ads delivery health omit leaflet discovery maps", () => {
  for (const file of REMOVE) {
    const html = read(file);
    assert.doesNotMatch(html, /unpkg\.com\/leaflet/);
    assert.doesNotMatch(html, /adTargetMapPanel|jobLocationPickerPanel/);
  }
  const jobs = read("jobs.html");
  assert.match(jobs, /id="jobCountry"/);
  assert.match(jobs, /id="jobCity"/);
  assert.match(jobs, /id="jobLocation"/);
  assert.doesNotMatch(jobs, /suppressAllMaps/);

  const ads = read("ads.html");
  assert.match(ads, /id="adLatitude"/);
  assert.match(ads, /id="adLongitude"/);

  const delivery = read("delivery.html");
  assert.match(delivery, /id="pickupAddress"/);
  assert.match(delivery, /id="deliveryAddress"/);
  assert.doesNotMatch(delivery, /applyMapToPickup/);
});

test("service worker bumped for maps tickets accommodation only", () => {
  const sw = read("sw.js");
  const reg = read("havkar-sw-register.js");
  /* Later rain/cameras/traffic release supersedes the live-map-only SW tag. */
  assert.match(sw, /havkar-sw-20261118-emergency-camera-overlay-fix-v1/);
  assert.match(reg, /havkar-sw-20261118-emergency-camera-overlay-fix-v1/);
  assert.ok(KEEP.every((f) => fs.existsSync(path.join(root, f))));
});
