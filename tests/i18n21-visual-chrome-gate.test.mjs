/**
 * Visual/chrome gate: scan static HTML for data-i18n values that would
 * render as raw keys or incomplete chrome. Any hit fails release.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { URLSearchParams } from "node:url";

function loadPhraseApi() {
  const store = Object.create(null);
  const ctx = {
    console,
    document: {
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
    },
    URLSearchParams,
    URL,
    localStorage: {
      getItem(k) {
        return store[k] ?? null;
      },
      setItem(k, v) {
        store[k] = String(v);
      },
      removeItem(k) {
        delete store[k];
      }
    },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    navigator: { language: "en", languages: ["en"] },
    location: {
      href: "http://localhost/",
      pathname: "/",
      search: "",
      hash: "",
      reload() {}
    },
    NodeFilter: {
      SHOW_TEXT: 4,
      FILTER_ACCEPT: 1,
      FILTER_REJECT: 2,
      FILTER_SKIP: 3
    },
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
  ctx.document.dispatchEvent = function () {
    return true;
  };
  ctx.document.documentElement.appendChild = function () {};
  ctx.document.documentElement.querySelectorAll = function () {
    return [];
  };
  ctx.document.documentElement.querySelector = function () {
    return null;
  };
  ctx.document.createTreeWalker = function () {
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
    vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { timeout: 20000, filename: f });
  }
  return { ctx, store };
}

function collectDataI18nKeys(html) {
  const keys = new Set();
  const re = /data-i18n(?:-placeholder|-title|-aria-label|-alt)?=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    keys.add(raw);
  }
  return [...keys];
}

test("every data-i18n key on wired pages resolves without raw/stuck for all 21 langs", () => {
  const { ctx, store } = loadPhraseApi();
  const map = ctx.HAVKAR_I18N_KEY_MAP;
  const langs = ctx.HAVKAR_UI_I18N21.selectable;
  const pages = fs
    .readdirSync(".")
    .filter((f) => f.endsWith(".html"))
    .filter((f) => fs.readFileSync(f, "utf8").includes("havkar-ui-i18n21.js"));

  assert.ok(pages.length >= 40, `expected broad page wiring, got ${pages.length}`);

  const failures = [];
  let keyChecks = 0;
  for (const page of pages) {
    const keys = collectDataI18nKeys(fs.readFileSync(page, "utf8"));
    for (const lang of langs) {
      store.havkar_language = lang;
      for (const key of keys) {
        keyChecks += 1;
        const english = map.resolveEnglish(key);
        const out = String(ctx.HAVKAR_I18N.phrase(key) || "");
        if (!out.trim()) {
          failures.push(`${page}|${lang}|${key}|empty`);
          continue;
        }
        if (map.looksLikeRawKey(out) && out === key) {
          failures.push(`${page}|${lang}|${key}|visible-key`);
        }
        if (map.looksStuck(english, out)) {
          failures.push(`${page}|${lang}|${key}|stuck:${out}`);
        }
      }
    }
  }

  assert.ok(keyChecks > 1000, `expected dense coverage, got ${keyChecks}`);
  assert.equal(
    failures.length,
    0,
    `visible-key/stuck chrome (${failures.length}):\n${failures.slice(0, 50).join("\n")}`
  );
});

test("index.html preserves 12 home tiles and settings bar markers", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const tileKeys = [
    "buySell",
    "jobs",
    "services",
    "wallet",
    "tickets",
    "accommodation",
    "ads",
    "delivery",
    "events",
    "Messenger",
    "havkarAi",
    "doctorsPharmacies"
  ];
  for (const k of tileKeys) {
    assert.ok(html.includes(`data-i18n="${k}"`), `missing tile ${k}`);
  }
  assert.ok(html.includes('data-havkar-tile="messenger"'), "messenger tile");
  assert.ok(html.includes("profile.html") || html.includes("settings"), "settings entry");
  assert.ok(!html.includes("messenger-logo-changed-marker"), "messenger logo untouched sentinel");
});

test("profile settings hub keeps search + featured language/support/about", () => {
  const html = fs.readFileSync("profile.html", "utf8");
  assert.ok(html.includes("settingsHubSearch"));
  assert.ok(html.includes("hub-featured"));
  assert.ok(html.includes("language.html"));
  assert.ok(html.includes("support.html"));
  assert.ok(html.includes("about.html"));
  assert.ok(html.includes("--havkar-green:#1b5e20") || html.includes("#1b5e20"));
  // Duplicate Support & About category rows removed (featured is single entry)
  assert.equal(html.includes('data-hub-category="support-about"'), false);
});
