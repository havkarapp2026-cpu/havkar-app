import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("havkar-ai-phrases.js", "utf8");
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(source, ctx);

const dictionary = ctx.window.HAVKAR_UI_DICTIONARY;
assert.ok(dictionary && typeof dictionary === "object");

const requiredLangs = ["it", "sv", "ckb", "kmr", "ar", "fa"];
const requiredKeys = [
  "Copy",
  "Copied",
  "Regenerate",
  "Refine this idea",
  "Develop this idea",
  "New Idea",
  "Business Ideas",
  "Ideas and guidance",
  "Your multilingual business assistant",
  "Start voice input",
  "Stop voice input",
  "Create Content",
  "Design Logo"
];

for (const code of requiredLangs) {
  assert.ok(dictionary[code], "missing language table: " + code);
  for (const key of requiredKeys) {
    assert.equal(
      typeof dictionary[code][key],
      "string",
      code + " missing " + key
    );
    assert.ok(dictionary[code][key].trim().length > 0, code + " empty " + key);
  }
}

// English falls back to the English key via interfaceText; no en table required.
assert.equal(dictionary.en && dictionary.en.Copy, undefined);

const page = fs.readFileSync("havkar-ai.html", "utf8");
assert.match(page, /function interfaceText\(/);
assert.match(page, /HAVKAR_UI_DICTIONARY/);
assert.match(page, /labeledAction\("Refine this idea"\)/);
assert.match(page, /labeledAction\("Develop this idea"\)/);
assert.match(page, /data-i18n-label="Business Ideas"/);
assert.match(page, /data-i18n-label="Create Content"/);
assert.match(page, /data-i18n-label/);
assert.match(page, /applyInterfaceDirection/);
assert.match(page, /dir === "rtl"/);

console.log("HAVKAR_AI_NEW_IDEA_I18N_TEST_OK");
