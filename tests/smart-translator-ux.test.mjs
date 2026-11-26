import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("havkar-smart-translate.js exposes user-initiated API without auto-run", () => {
  const source = fs.readFileSync("havkar-smart-translate.js", "utf8");
  assert.match(source, /Never auto-run on page load/);
  assert.match(source, /mountControls/);
  assert.match(source, /mountOnChatMessage/);
  assert.match(source, /View original/);
  assert.match(source, /\/api\/translate/);

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
    getElementById() {
      return null;
    },
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        style: {},
        className: "",
        textContent: "",
        hidden: false,
        setAttribute() {},
        addEventListener() {},
        appendChild() {},
        append() {}
      };
    },
    head: { appendChild() {} },
    querySelectorAll() {
      return [];
    }
  };
  const root = { localStorage, document, console };
  vm.createContext(root);
  vm.runInContext(fs.readFileSync("havkar-smart-translate.js", "utf8"), root);
  assert.ok(root.HAVKAR_SMART_TRANSLATE);
  assert.equal(typeof root.HAVKAR_SMART_TRANSLATE.translateText, "function");
  assert.equal(typeof root.HAVKAR_SMART_TRANSLATE.mountControls, "function");
  assert.equal(root.HAVKAR_SMART_TRANSLATE.askBeforeListings(), true);
});

test("language.html includes smart translation preferences", () => {
  const html = fs.readFileSync("language.html", "utf8");
  assert.match(html, /id="smartTranslatePrefs"/);
  assert.match(html, /id="prefOfflineUiOnly"/);
  assert.match(html, /id="prefLiveUiTranslate"/);
  assert.match(html, /id="prefAskBeforeListings"/);
  assert.match(html, /havkar-smart-translate\.js/);
});

test("user-content pages wire smart translator helper", () => {
  for (const file of [
    "buy-sell.html",
    "ad-details.html",
    "support.html",
    "chat.html",
    "about.html",
    "product.html"
  ]) {
    const html = fs.readFileSync(file, "utf8");
    assert.match(
      html,
      /havkar-smart-translate\.js/,
      `${file} missing smart translator script`
    );
  }
  const chat = fs.readFileSync("chat.html", "utf8");
  assert.match(chat, /mountOnChatMessage/);
  const about = fs.readFileSync("about.html", "utf8");
  assert.match(about, /havkar-i18n\.js/, "about.html must load Core i18n");
});

test("offline packs include Translate / View original / support chrome in all 21 langs", () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("havkar-ui-i18n21.js", "utf8"), ctx);
  const api = ctx.HAVKAR_UI_I18N21;
  const required = [
    "Translate",
    "View original",
    "Show translation",
    "Smart translation",
    "How can we help you?",
    "Official Support",
    "Send support request",
    "Offline UI only (no auto API spend)"
  ];
  for (const lang of api.selectable) {
    if (lang === "en") continue;
    const pack = api.pack(lang);
    for (const key of required) {
      assert.ok(
        pack[key] && String(pack[key]).trim(),
        `${lang} missing offline phrase: ${key}`
      );
    }
  }
  assert.notEqual(api.pack("ckb").Translate, api.pack("kmr").Translate);
});
