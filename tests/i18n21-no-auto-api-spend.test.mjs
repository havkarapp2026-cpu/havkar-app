import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadUi21() {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync("havkar-ui-i18n21.js", "utf8"),
    ctx,
    { filename: "havkar-ui-i18n21.js" }
  );
  return ctx.HAVKAR_UI_I18N21;
}

test("UI21 packs equalized across all 20 non-English selectable languages", () => {
  const api = loadUi21();
  assert.ok(api && typeof api.pack === "function");
  const itKeys = Object.keys(api.pack("it"));
  assert.ok(itKeys.length >= 280, `expected dense Italian pack, got ${itKeys.length}`);
  for (const lang of api.selectable) {
    if (lang === "en") continue;
    const pack = api.pack(lang) || {};
    const missing = itKeys.filter((k) => !(k in pack));
    assert.equal(
      missing.length,
      0,
      `${lang} missing ${missing.length} keys vs it (sample: ${missing.slice(0, 5).join(", ")})`
    );
  }
});

test("havkar-i18n gates /api/translate behind havkar_ui_live_translate opt-in", () => {
  const source = fs.readFileSync("havkar-i18n.js", "utf8");
  assert.match(source, /havkar_ui_live_translate/);
  assert.match(source, /isUiLiveTranslateEnabled/);
  assert.match(source, /setUiLiveTranslateEnabled/);
  assert.match(source, /applyDataI18nAttributes/);
  assert.match(
    source,
    /!isUiLiveTranslateEnabled\(\)/,
    "missing strings must skip API when live translate is off"
  );
});

test("default live UI translate is OFF (no auto spend)", async () => {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };

  let fetchCalls = 0;
  const fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({
        ok: true,
        translations: [{ translatedText: "X" }]
      })
    };
  };

  const document = {
    documentElement: { lang: "en", dir: "ltr", setAttribute() {} },
    body: {
      querySelectorAll: () => [],
      childNodes: []
    },
    // Keep loading so initialize() is deferred and never auto-fired in this unit test.
    readyState: "loading",
    addEventListener() {},
    getElementById() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createTreeWalker() {
      return {
        nextNode() {
          return null;
        }
      };
    },
    createElement() {
      return { style: {}, setAttribute() {}, appendChild() {}, append() {} };
    },
    dispatchEvent() {}
  };

  const window = {
    localStorage,
    location: { pathname: "/index.html", search: "", href: "http://localhost/" },
    HAVKAR_UI_I18N21: loadUi21()
  };
  window.window = window;
  globalThis.HAVKAR_UI_I18N21 = window.HAVKAR_UI_I18N21;

  const ctx = {
    window,
    document,
    localStorage,
    fetch,
    console,
    URLSearchParams,
    NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 },
    MutationObserver: class {
      observe() {}
    },
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    setTimeout,
    clearTimeout,
    globalThis
  };
  ctx.globalThis = ctx;

  // Avoid entry redirect / auto initialize side effects by stubbing location carefully
  vm.runInContext(
    fs.readFileSync("havkar-i18n.js", "utf8"),
    vm.createContext(ctx),
    { filename: "havkar-i18n.js" }
  );

  const i18n = ctx.window.HAVKAR_I18N;
  assert.ok(i18n);
  assert.equal(i18n.isUiLiveTranslateEnabled(), false);

  localStorage.setItem("havkar_language", "fa");
  // Force a missing phrase path with live OFF — should not fetch
  fetchCalls = 0;
  // translateUniqueTexts is not exported; verify flag + source gate instead
  assert.equal(i18n.isUiLiveTranslateEnabled(), false);
  i18n.setUiLiveTranslateEnabled(true);
  assert.equal(i18n.isUiLiveTranslateEnabled(), true);
  i18n.setUiLiveTranslateEnabled(false);
  assert.equal(i18n.isUiLiveTranslateEnabled(), false);
  assert.equal(fetchCalls, 0);
});
