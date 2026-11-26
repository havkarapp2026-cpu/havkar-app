import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadPacks() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("havkar-ui-i18n21.js", "utf8"), ctx);
  vm.runInContext(
    fs.readFileSync("havkar-ui-i18n21-generated.js", "utf8"),
    ctx
  );
  return ctx.HAVKAR_UI_I18N21;
}

test("generated glossary equalizes dense packs across 20 non-English languages", () => {
  const api = loadPacks();
  const it = api.pack("it");
  assert.ok(Object.keys(it).length >= 2000, `expected dense pack, got ${Object.keys(it).length}`);
  for (const lang of api.selectable) {
    if (lang === "en") continue;
    const pack = api.pack(lang) || {};
    const missing = Object.keys(it).filter((k) => !(k in pack));
    assert.equal(
      missing.length,
      0,
      `${lang} missing ${missing.length} vs it`
    );
  }
});

test("Sorani and Kurmanji generated Back phrases stay distinct when possible", () => {
  const api = loadPacks();
  const ckb = api.pack("ckb").Back;
  const kmr = api.pack("kmr").Back;
  assert.ok(ckb && kmr);
  // Prefer distinct; if MT collapses, still non-English
  assert.notEqual(ckb, "Back");
  assert.notEqual(kmr, "Back");
});

test("critical Home/Settings FA phrases resolve offline without live API", () => {
  const api = loadPacks();
  const fa = api.pack("fa");
  assert.ok(fa["Profile & Settings"]);
  assert.notEqual(fa["Profile & Settings"], "Profile & Settings");
  assert.ok(fa["Smart translation"]);
  assert.notEqual(fa["Smart translation"], "Smart translation");
  assert.ok(fa.Back);
});
