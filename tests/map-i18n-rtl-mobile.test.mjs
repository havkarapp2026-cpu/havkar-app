/**
 * RTL / LTR direction + mobile layout contracts for map chrome.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const toolbar = read("havkar-map-pro-toolbar.js");
const layers = read("havkar-map-live-layers.js");
const trip = read("havkar-trip-planner.js");
const surr = read("havkar-hotel-surroundings.js");
const cssPro = read("havkar-map-pro.css");
const cssSurr = read("havkar-hotel-surroundings.css");
const cssTrip = fs.existsSync(path.join(root, "havkar-trip-planner.css"))
  ? read("havkar-trip-planner.css")
  : "";

for (const src of [toolbar, layers, trip, surr]) {
  assert.match(src, /setAttribute\("dir", mapDir\(\)\)/);
  assert.match(src, /havkar:language-changed/);
}

// Flex-wrap toolbars remain usable on narrow screens
assert.match(cssPro, /flex-wrap:\s*wrap|flex-wrap:wrap/);
assert.match(cssPro, /min-height:\s*40px|min-height:40px/);
assert.match(cssSurr, /flex-wrap:\s*wrap|flex-wrap:wrap/);
if (cssTrip) assert.match(cssTrip, /flex-wrap:\s*wrap|flex-wrap:wrap/);

const sandbox = {
  localStorage: {
    store: { havkar_language: "en" },
    getItem(k) {
      return this.store[k] || null;
    },
    setItem(k, v) {
      this.store[k] = String(v);
    }
  },
  document: {
    readyState: "complete",
    querySelectorAll() {
      return [];
    },
    addEventListener() {}
  },
  window: null,
  globalThis: null
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.window.addEventListener = function () {};
vm.runInNewContext(read("havkar-map-i18n.js"), sandbox);
const api = sandbox.HAVKAR_MAP_I18N;

const cases = [
  ["fa", "rtl"],
  ["ckb", "rtl"],
  ["ar", "rtl"],
  ["ur", "rtl"],
  ["kmr", "ltr"],
  ["en", "ltr"],
  ["tr", "ltr"]
];
for (const [code, dir] of cases) {
  sandbox.localStorage.store.havkar_language = code;
  assert.equal(api.dir(), dir, code);
  assert.ok(api.t("maps.route").length > 1);
  assert.ok(api.t("maps.my_location").length > 1);
}

// Button order keys remain present (DOM order: search → near → route → actions)
assert.ok(toolbar.indexOf("havkar-map-pro-search") < toolbar.indexOf("havkar-map-pro-near"));
assert.ok(toolbar.indexOf("havkar-map-pro-near") < toolbar.indexOf("havkar-map-pro-route"));
assert.ok(toolbar.indexOf("havkar-map-pro-route") < toolbar.indexOf("havkar-map-pro-actions"));

console.log("MAP_I18N_RTL_MOBILE_OK");
