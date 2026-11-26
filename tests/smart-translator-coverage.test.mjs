/**
 * Smart translator coverage: user-content surfaces + no auto-spend + observe API.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const CONTENT_PAGES = [
  "buy-sell.html",
  "product.html",
  "ad-details.html",
  "ads.html",
  "services.html",
  "jobs.html",
  "chat.html",
  "support.html"
];

test("user-content pages mount smart translator (observe or attach)", () => {
  for (const file of CONTENT_PAGES) {
    const html = fs.readFileSync(file, "utf8");
    assert.match(html, /havkar-smart-translate\.js/, `${file} script`);
    assert.ok(
      /observeAndAttach|attachToSelectors|mountOnChatMessage/.test(html),
      `${file} missing mount call`
    );
  }
});

test("smart translator exposes observeAndAttach and never auto-fetches on load", () => {
  const source = fs.readFileSync("havkar-smart-translate.js", "utf8");
  assert.match(source, /Never auto-run on page load/);
  assert.match(source, /observeAndAttach/);
  assert.match(source, /View original/);
  assert.match(source, /rate_limited/);

  let fetchCalls = 0;
  const localStorage = {
    _d: {},
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null;
    },
    setItem(k, v) {
      this._d[k] = String(v);
    }
  };
  const document = {
    body: {},
    getElementById() {
      return null;
    },
    createElement() {
      return {
        style: {},
        className: "",
        textContent: "",
        hidden: false,
        setAttribute() {},
        addEventListener() {},
        appendChild() {}
      };
    },
    head: { appendChild() {} },
    querySelectorAll() {
      return [];
    }
  };
  const root = {
    localStorage,
    document,
    console,
    fetch() {
      fetchCalls += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, translatedText: "x" })
      });
    },
    MutationObserver: class {
      observe() {}
    }
  };
  vm.createContext(root);
  vm.runInContext(fs.readFileSync("havkar-smart-translate.js", "utf8"), root);
  assert.ok(root.HAVKAR_SMART_TRANSLATE.observeAndAttach);
  root.HAVKAR_SMART_TRANSLATE.observeAndAttach([".x"], { kind: "listing" });
  assert.equal(fetchCalls, 0, "observe must not call /api/translate");
});

test("PR #295 Personal Account Swedish remains Personligt konto", () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("havkar-ui-i18n21.js", "utf8"), ctx);
  assert.equal(ctx.HAVKAR_UI_I18N21.pack("sv")["Personal Account"], "Personligt konto");
  assert.match(
    ctx.HAVKAR_UI_I18N21.pack("sv")[
      "Independent crypto rail · not a banking / Stripe fiat currency"
    ],
    /krypto/i
  );
});

test("translate API module keeps shared budget / rate limit helpers", () => {
  const src = fs.readFileSync("api/translate.js", "utf8");
  assert.match(src, /consume_translation_budget/);
  assert.match(src, /rate_limited|sendRateLimited/);
  assert.match(src, /GOOGLE_TRANSLATION_PRIVATE_KEY/);
  assert.equal(src.includes("sk_live"), false);
});
