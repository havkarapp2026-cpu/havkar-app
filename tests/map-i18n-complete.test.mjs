/**
 * HAVKAR map multilingual coverage — all 21 selectable languages.
 * Place names must never be rewritten by map UI packs.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const SELECTABLE = [
  "en",
  "it",
  "de",
  "fr",
  "es",
  "pt",
  "nl",
  "sv",
  "pl",
  "id",
  "zh",
  "ja",
  "ko",
  "hi",
  "ru",
  "ckb",
  "kmr",
  "tr",
  "ar",
  "fa",
  "ur"
];
const RTL = new Set(["fa", "ar", "ckb", "ur"]);

const mapI18nSrc = read("havkar-map-i18n.js");
const toolbar = read("havkar-map-pro-toolbar.js");
const layers = read("havkar-map-live-layers.js");
const trip = read("havkar-trip-planner.js");
const surr = read("havkar-hotel-surroundings.js");
const tickets = read("tickets.html");
const acc = read("accommodation.html");
const sw = read("sw.js");
const i18nCore = read("havkar-i18n.js");

assert.match(tickets, /havkar-map-i18n\.js/);
assert.match(acc, /havkar-map-i18n\.js/);
assert.ok(
  tickets.indexOf("havkar-map-i18n.js") < tickets.indexOf("havkar-map-pro-toolbar.js"),
  "map i18n loads before toolbar on tickets"
);
assert.ok(
  acc.indexOf("havkar-map-i18n.js") < acc.indexOf("havkar-map-pro-toolbar.js"),
  "map i18n loads before toolbar on accommodation"
);

assert.match(toolbar, /HAVKAR_MAP_I18N/);
assert.match(toolbar, /function mt\(/);
assert.match(toolbar, /havkar:i18n-ready/);
assert.match(toolbar, /havkar:language-changed/);
assert.match(toolbar, /refreshMapChrome/);
assert.match(toolbar, /mt\("maps\.search_place"\)/);
assert.match(toolbar, /mt\("maps\.view_surroundings"\)/);
assert.match(toolbar, /mt\("maps\.street_view_360"\)/);
assert.match(toolbar, /mt\("maps\.my_location"\)/);
assert.match(toolbar, /mt\("maps\.fullscreen"\)/);
assert.match(toolbar, /setAttribute\("dir", mapDir\(\)\)/);

assert.match(layers, /mt\(pair\[1\]\)/);
assert.match(layers, /maps\.layer_satellite/);
assert.match(layers, /havkar:language-changed/);
assert.match(layers, /setAttribute\("dir", mapDir\(\)\)/);

assert.match(trip, /mt\("maps\.trip_title"\)/);
assert.match(trip, /mt\("maps\.calculate_route"\)/);
assert.match(trip, /mt\("maps\.driving"\)/);
assert.match(trip, /havkar:i18n-ready/);

assert.match(surr, /mt\("maps\.surr_title"\)/);
assert.match(surr, /mt\("maps\.widen_360"\)/);
assert.match(surr, /mt\("maps\.msg_nearest_live"/);
assert.match(surr, /mt\("maps\.msg_no_cams_radius"\)/);
assert.match(surr, /havkar:language-changed/);

assert.match(i18nCore, /havkar:language-changed/);
assert.match(sw, /map-final-dock-v1|live-cameras-restore-v1|map-search-destination-v1|map-i18n-complete-v1/);

// Hardcoded chrome leftovers that must not remain as sole English UI labels
for (const [file, src, banned] of [
  ["toolbar", toolbar, ['"Search place"', '"View surroundings"', '"Nearby cameras"', '"My location"', '"Fullscreen"']],
  ["layers", layers, ['["street", "Street map"]', '["satellite", "Satellite"]']],
  ["trip", trip, ['"Trip planner"', '"Calculate route"', '"Clear plan"']],
  ["surr", surr, ['"Surroundings"', '"Widen 360° search"', '"Route from here"']]
]) {
  for (const b of banned) {
    assert.equal(src.includes(b), false, `${file} still hardcodes ${b}`);
  }
}

const listeners = [];
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
    documentElement: { lang: "en", dir: "ltr", setAttribute() {} },
    querySelectorAll() {
      return [];
    },
    addEventListener(type, fn) {
      listeners.push([type, fn]);
    },
    dispatchEvent() {}
  },
  window: null,
  globalThis: null
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.window.addEventListener = function () {};
vm.runInNewContext(mapI18nSrc, sandbox);
const api = sandbox.HAVKAR_MAP_I18N;
assert.ok(api);
assert.equal(api.selectable.length, SELECTABLE.length);
for (const code of SELECTABLE) {
  assert.ok(api.selectable.indexOf(code) !== -1, "selectable missing " + code);
}

const REQUIRED_KEYS = [
  "maps.search_place",
  "maps.search_placeholder",
  "maps.nearby_cameras",
  "maps.nearby_photos",
  "maps.street_view_360",
  "maps.view_surroundings",
  "maps.my_location",
  "maps.fullscreen",
  "maps.layer_street",
  "maps.layer_satellite",
  "maps.layer_hybrid",
  "maps.layer_live",
  "maps.layer_rain",
  "maps.layer_live_cams",
  "maps.layer_intersection",
  "maps.layer_traffic",
  "maps.surr_title",
  "maps.trip_title",
  "maps.calculate_route",
  "maps.msg_no_360",
  "maps.msg_no_cams_radius",
  "maps.msg_nearest_live",
  "maps.cam_state_no_live_here",
  "maps.cam_state_exists_no_play",
  "maps.cam_feature_available",
  "maps.cam_outside_radius",
  "maps.msg_using_map_center",
  "maps.badge_plus_off",
  "maps.travel_plus_off"
];

const verified = [];
for (const code of SELECTABLE) {
  sandbox.localStorage.store.havkar_language = code;
  assert.equal(api.lang(), code, code + " lang()");
  const dir = api.dir();
  if (RTL.has(code)) {
    assert.equal(dir, "rtl", code + " must be rtl");
    assert.equal(!!api.rtl[code], true, code + " rtl map");
  } else {
    assert.equal(dir, "ltr", code + " must be ltr");
    assert.equal(!!api.rtl[code], false, code + " ltr map");
  }
  // Kurmanji explicitly LTR (not Sorani)
  if (code === "kmr") assert.equal(dir, "ltr");
  if (code === "ckb") assert.equal(dir, "rtl");
  if (code === "fa") assert.equal(dir, "rtl");

  for (const key of REQUIRED_KEYS) {
    const text = api.t(key, { km: "12.3", q: "Roma", from: "A", to: "B", place: "Bari", m: "250", kind: "cameras" });
    assert.ok(text && text.length > 1, `${code} missing ${key}`);
    assert.notEqual(text, key, `${code} untranslated key ${key}`);
    // Place-name placeholders must survive
    if (key === "maps.msg_loading_surr") {
      assert.match(text, /Bari/);
    }
    if (key === "maps.msg_searching") {
      assert.match(text, /Roma/);
    }
    if (key === "maps.msg_nearest_live") {
      assert.match(text, /12\.3/);
    }
  }
  // Payments / sales remain OFF in every language pack (never “ON” sales)
  const plus = api.t("maps.badge_plus_off");
  assert.match(plus, /Maps Plus/i);
  assert.equal(/sales\s*ON|فروش روشن|charge_allowed/i.test(plus), false, code + " sales must stay OFF");
  verified.push(code);
}

// Sorani ≠ Kurmanji
sandbox.localStorage.store.havkar_language = "ckb";
const ckbSearch = api.t("maps.search_place");
sandbox.localStorage.store.havkar_language = "kmr";
const kmrSearch = api.t("maps.search_place");
assert.notEqual(ckbSearch, kmrSearch);

// Language change notify path is registered
assert.ok(listeners.some((x) => x[0] === "havkar:i18n-ready"));
assert.ok(listeners.some((x) => x[0] === "havkar:language-changed"));

// Immediate refresh: simulate language switch without reload
let refreshCount = 0;
api.onChange(() => {
  refreshCount += 1;
});
sandbox.localStorage.store.havkar_language = "fa";
api.refresh();
assert.ok(refreshCount >= 1);
assert.equal(api.t("maps.search_place"), api.ui["maps.search_place"].fa);
assert.equal(api.dir(), "rtl");

console.log(
  "MAP_I18N_TEST_OK languages_verified=" +
    verified.join(",") +
    " count=" +
    verified.length
);
