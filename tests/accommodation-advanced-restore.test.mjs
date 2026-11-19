import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync("accommodation.html", "utf8");
const i18n = fs.readFileSync("havkar-accommodation-i18n.js", "utf8");

test("Accommodation restores advanced map-first search panel (not discovery-collapsed details)", () => {
  assert.match(html, /<section class="search-panel"[^>]*aria-label="Hotel search"/);
  assert.doesNotMatch(html, /acc-discovery/);
  assert.doesNotMatch(html, /<details class="search-panel"/);
  assert.ok(html.indexOf('id="map"') < html.indexOf('id="empty"'));
  assert.ok(html.indexOf('id="map"') < html.indexOf('id="listings"'));
});

test("Accommodation keeps map tooling, dates, payments gates, surroundings, live layers", () => {
  for (const id of [
    "cityInput",
    "checkInInput",
    "checkOutInput",
    "adultsInput",
    "accProToolbarHost",
    "havkarSurroundingsPanel",
    "havkarTripPlanner",
    "quoteStripeBtn",
    "quoteXlmBtn",
    "searchHotelsBtn",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /havkar-map-live-layers\.js/);
  assert.match(html, /havkar-hotel-surroundings\.js/);
  assert.match(html, /Live hotel charges stay OFF|Owner-gated/);
});

test("Accommodation FA phrases cover advanced chrome labels", () => {
  assert.match(i18n, /FA_PHRASES/);
  assert.match(i18n, /"Search stays":\s*"جستجوی اقامت"/);
  assert.match(i18n, /"Map \+ list":\s*"نقشه \+ فهرست"/);
  assert.match(i18n, /lang === "fa"/);
});
