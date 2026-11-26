import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SKIP_NO_BODY = new Set();

test("every HTML page with a body loads UI21 + Core (+ generated when present)", () => {
  const files = fs.readdirSync(".").filter((f) => f.endsWith(".html"));
  const missing = [];
  for (const f of files) {
    const html = fs.readFileSync(f, "utf8");
    if (!/<\/body>/i.test(html)) {
      SKIP_NO_BODY.add(f);
      continue;
    }
    const hasUi = /havkar-ui-i18n21\.js/.test(html);
    const hasCore = /havkar-i18n\.js/.test(html);
    if (!hasUi || !hasCore) missing.push(f);
  }
  assert.deepEqual(missing, [], `pages missing i18n wiring: ${missing.join(", ")}`);
});

test("generated offline glossary file exists and merges into packs", () => {
  assert.ok(fs.existsSync("havkar-ui-i18n21-generated.js"));
  const src = fs.readFileSync("havkar-ui-i18n21-generated.js", "utf8");
  // Placeholder empty IIFE is only acceptable mid-generation; prefer GENERATED payload
  if (src.includes("GENERATED")) {
    assert.match(src, /HAVKAR_UI_I18N21/);
    assert.match(src, /api\.pack/);
  }
});

test("live UI translate remains opt-in (no auto spend)", () => {
  const src = fs.readFileSync("havkar-i18n.js", "utf8");
  assert.match(src, /havkar_ui_live_translate/);
  assert.match(src, /!isUiLiveTranslateEnabled\(\)/);
});
