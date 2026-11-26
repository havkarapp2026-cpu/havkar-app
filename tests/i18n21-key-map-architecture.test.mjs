/**
 * Architectural gate: camelCase data-i18n keys must resolve to English
 * phrases and never surface as stuck MT or raw keys in any of 21 langs.
 * Fail release if any chrome key leaks or stuck word appears.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { URLSearchParams } from "node:url";

const CRITICAL_CAMEL = [
  "buySell",
  "havkarAi",
  "doctorsPharmacies",
  "tagline",
  "settingsHubSubtitle",
  "tryAnotherKeyword",
  "cryptoMarket",
  "preferencesHint",
  "messengerTitle",
  "languageAndSmartTranslateHint"
];

const HOME_ENGLISH = [
  "Buy & Sell",
  "Jobs",
  "Services",
  "Wallet",
  "Tickets",
  "Accommodation",
  "Ads",
  "Delivery",
  "Events",
  "Messenger",
  "HAVKAR AI",
  "Doctors & Pharmacies",
  "Connect • Trade • Work • Help"
];

function loadRuntime() {
  const store = Object.create(null);
  const document = {
    documentElement: {
      lang: "en",
      dir: "ltr",
      setAttribute(k, v) {
        this[k] = v;
      },
      getAttribute(k) {
        return this[k] || null;
      }
    },
    body: {
      classList: {
        add() {},
        remove() {},
        contains() {
          return false;
        }
      },
      querySelectorAll() {
        return [];
      },
      querySelector() {
        return null;
      },
      appendChild() {}
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    getElementById() {
      return null;
    },
    createElement() {
      return {
        style: {},
        setAttribute() {},
        appendChild() {},
        querySelectorAll() {
          return [];
        },
        querySelector() {
          return null;
        }
      };
    },
    head: {
      appendChild() {},
      querySelectorAll() {
        return [];
      }
    },
    addEventListener() {}
  };
  document.documentElement.appendChild = function () {};
  const ctx = {
    console,
    document,
    URLSearchParams,
    URL,
    localStorage: {
      getItem(k) {
        return Object.prototype.hasOwnProperty.call(store, k)
          ? store[k]
          : null;
      },
      setItem(k, v) {
        store[k] = String(v);
      },
      removeItem(k) {
        delete store[k];
      }
    },
    sessionStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {}
    },
    navigator: { language: "en", languages: ["en"] },
    location: {
      href: "http://localhost/index.html",
      pathname: "/index.html",
      search: "",
      hash: "",
      reload() {}
    },
    NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 },
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
    history: { replaceState() {} },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    setTimeout() {
      return 0;
    },
    clearTimeout() {},
    requestAnimationFrame() {
      return 0;
    },
    fetch: async () => ({ ok: false, json: async () => ({}) })
  };
  document.dispatchEvent = function () {
    return true;
  };
  document.documentElement.appendChild = function () {};
  document.documentElement.querySelectorAll = function () {
    return [];
  };
  document.documentElement.querySelector = function () {
    return null;
  };
  document.createTreeWalker = function () {
    return { nextNode() { return null; }, currentNode: null };
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of [
    "havkar-i18n-key-map.js",
    "havkar-ui-i18n21.js",
    "havkar-ui-i18n21-generated.js",
    "havkar-i18n.js"
  ]) {
    vm.runInContext(fs.readFileSync(f, "utf8"), ctx, {
      timeout: 20000,
      filename: f
    });
  }
  return { ctx, store };
}

test("key map file exists and maps critical camelCase keys", () => {
  assert.ok(fs.existsSync("havkar-i18n-key-map.js"));
  const { ctx } = loadRuntime();
  const map = ctx.HAVKAR_I18N_KEY_MAP;
  assert.ok(map);
  for (const k of CRITICAL_CAMEL) {
    const en = map.resolveEnglish(k);
    assert.notEqual(en, k, `${k} must map to English phrase`);
    if (map.isCamelCaseKey(k)) {
      assert.equal(map.looksLikeRawKey(k), true);
    }
  }
  assert.equal(map.resolveEnglish("tagline"), "Connect • Trade • Work • Help");
  assert.equal(map.resolveEnglish("buySell"), "Buy & Sell");
});

test("phrase() never returns camelCase or stuck chrome for 21 languages", () => {
  const { ctx, store } = loadRuntime();
  const api = ctx.HAVKAR_I18N;
  const map = ctx.HAVKAR_I18N_KEY_MAP;
  const langs = ctx.HAVKAR_UI_I18N21.selectable;
  assert.equal(langs.length, 21);

  const failures = [];
  for (const lang of langs) {
    store.havkar_language = lang;
    for (const key of CRITICAL_CAMEL) {
      const english = map.resolveEnglish(key);
      const out = String(api.phrase(key) || "");
      if (!out.trim()) {
        failures.push(`${lang}:${key} empty`);
        continue;
      }
      if (map.looksLikeRawKey(out)) {
        failures.push(`${lang}:${key} raw-key "${out}"`);
      }
      if (map.looksStuck(english, out)) {
        failures.push(`${lang}:${key} stuck "${out}" for "${english}"`);
      }
      if (lang === "en" && out !== english) {
        failures.push(`${lang}:${key} expected "${english}" got "${out}"`);
      }
    }
    for (const en of HOME_ENGLISH) {
      const out = String(api.phrase(en) || "");
      if (map.looksLikeRawKey(out)) {
        failures.push(`${lang}:home "${en}" -> raw "${out}"`);
      }
      if (map.looksStuck(en, out)) {
        failures.push(`${lang}:home stuck "${out}" for "${en}"`);
      }
    }
  }
  assert.equal(
    failures.length,
    0,
    `chrome translation failures:\n${failures.slice(0, 40).join("\n")}`
  );
});

test("FA home tiles are natural spaced phrases not stuck compounds", () => {
  const { ctx, store } = loadRuntime();
  store.havkar_language = "fa";
  const p = ctx.HAVKAR_I18N.phrase.bind(ctx.HAVKAR_I18N);
  assert.equal(p("buySell"), "خرید و فروش");
  assert.match(p("doctorsPharmacies"), /پزشک/);
  assert.equal(
    /^پزشکانداروخانه/.test(p("doctorsPharmacies")),
    false
  );
  assert.notEqual(p("tagline"), "شعار تبلیغاتی");
  assert.match(p("tagline"), /•/);
  assert.ok(
    p("havkarAi").includes("HAVKAR") || p("havkarAi").includes("هاوکار")
  );
});

test("Sorani and Kurmanji stay independent for settings subtitle", () => {
  const { ctx, store } = loadRuntime();
  store.havkar_language = "ckb";
  const ckb = ctx.HAVKAR_I18N.phrase("settingsHubSubtitle");
  store.havkar_language = "kmr";
  const kmr = ctx.HAVKAR_I18N.phrase("settingsHubSubtitle");
  assert.notEqual(ckb, kmr);
  assert.notEqual(ckb, "settingsHubSubtitle");
  assert.notEqual(kmr, "settingsHubSubtitle");
});

test("language preference persists across reload simulation", async () => {
  const { ctx, store } = loadRuntime();
  await ctx.HAVKAR_I18N.setLanguage("ar");
  assert.equal(store.havkar_language, "ar");
  assert.equal(ctx.HAVKAR_I18N.getLanguage(), "ar");
  await ctx.HAVKAR_I18N.setLanguage("sv");
  assert.equal(store.havkar_language, "sv");
  assert.equal(ctx.document.documentElement.dir, "ltr");
  await ctx.HAVKAR_I18N.setLanguage("fa");
  assert.equal(ctx.document.documentElement.dir, "rtl");
  await ctx.HAVKAR_I18N.setLanguage("ckb");
  assert.equal(ctx.document.documentElement.dir, "rtl");
  await ctx.HAVKAR_I18N.setLanguage("kmr");
  assert.equal(ctx.document.documentElement.dir, "ltr");
});

test("generated glossary no longer stores camelCase chrome keys", () => {
  const src = fs.readFileSync("havkar-ui-i18n21-generated.js", "utf8");
  const m = src.match(/var GENERATED = (\{[\s\S]*\});\n  var api/);
  assert.ok(m, "GENERATED block");
  const GENERATED = JSON.parse(m[1]);
  const camel = [];
  for (const lang of Object.keys(GENERATED)) {
    for (const k of Object.keys(GENERATED[lang])) {
      if (/^[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/.test(k)) {
        camel.push(`${lang}:${k}`);
      }
    }
  }
  assert.equal(camel.length, 0, `camelCase leftovers: ${camel.slice(0, 20)}`);
});

test("all HTML pages with UI21 also load key-map before it", () => {
  const pages = fs
    .readdirSync(".")
    .filter((f) => f.endsWith(".html"));
  const bad = [];
  for (const page of pages) {
    const html = fs.readFileSync(page, "utf8");
    if (!html.includes("havkar-ui-i18n21.js")) continue;
    if (!html.includes("havkar-i18n-key-map.js")) {
      bad.push(`${page}: missing key-map`);
      continue;
    }
    const mapAt = html.indexOf("havkar-i18n-key-map.js");
    const uiAt = html.indexOf("havkar-ui-i18n21.js");
    if (mapAt > uiAt) bad.push(`${page}: key-map after ui21`);
  }
  assert.equal(bad.length, 0, bad.join("\n"));
});
