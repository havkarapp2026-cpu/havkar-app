/**
 * CI guard: all 21 selectable languages include critical Home/Settings phrases.
 * Offline glossaries only — no live AI spend.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadUi21() {
  const ctx = {
    console,
    window: {},
    globalThis: null
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync("havkar-ui-i18n21.js", "utf8"), ctx, {
    timeout: 8000
  });
  return ctx.HAVKAR_UI_I18N21;
}

const REQUIRED_ALL = [
  "Signed in",
  "Profile & Settings",
  "Language, support, about, account, and privacy",
  "Messenger",
  "Personal information",
  "Preferences",
  "My wallet",
  "Transaction history",
  "Security & privacy",
  "Choose a language before signing up",
  "Language & smart translation",
  "Support center",
  "About HAVKAR",
  "Log Out"
];

const REQUIRED_NON_EN = ["Buy & Sell", "HAVKAR AI"];

test("exactly 21 selectable languages with ckb and kmr independent", () => {
  const api = loadUi21();
  assert.equal(api.selectable.length, 21);
  assert.ok(api.selectable.includes("ckb"));
  assert.ok(api.selectable.includes("kmr"));
  assert.equal(api.selectable.includes("ku"), false);
  assert.ok(api.selectable.includes("fa"));
  assert.ok(api.selectable.includes("ar"));
  assert.ok(api.selectable.includes("sv"));
});

test("critical home/settings phrases exist in every language pack", () => {
  const api = loadUi21();
  for (const lang of api.selectable) {
    const pack = api.pack(lang) || {};
    for (const phrase of REQUIRED_ALL) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(pack, phrase),
        `${lang} missing "${phrase}"`
      );
      assert.notEqual(String(pack[phrase] || "").trim(), "", `${lang} empty "${phrase}"`);
    }
    if (lang !== "en") {
      for (const phrase of REQUIRED_NON_EN) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(pack, phrase),
          `${lang} missing "${phrase}"`
        );
      }
    }
  }
});

test("Swedish Signed in is Swedish not English or Persian", () => {
  const api = loadUi21();
  const sv = api.pack("sv")["Signed in"];
  assert.equal(sv, "Inloggad");
  assert.notEqual(sv, "Signed in");
  assert.notEqual(sv, "وارد شده‌اید");
});

test("Sorani and Kurmanji packs stay distinct for Signed in", () => {
  const api = loadUi21();
  const ckb = api.pack("ckb")["Signed in"];
  const kmr = api.pack("kmr")["Signed in"];
  assert.notEqual(ckb, kmr);
});
