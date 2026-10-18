import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const phrases = fs.readFileSync(new URL("../havkar-ai-phrases.js", import.meta.url), "utf8");
const dictionary = fs.readFileSync(new URL("../havkar-ui-dictionary.js", import.meta.url), "utf8");

assert.doesNotMatch(phrases, /base\[code,/);
assert.match(phrases, /Object\.assign\(\{\}, base\[code\], extra\[code\]\)/);

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(dictionary, sandbox, { filename: "havkar-ui-dictionary.js" });
vm.runInContext(phrases, sandbox, { filename: "havkar-ai-phrases.js" });

const rows = sandbox.window.HAVKAR_UI_DICTIONARY;
const codes = [
  "it", "de", "fr", "es", "pt", "nl", "sv", "pl", "id",
  "zh", "ja", "ko", "hi", "ru", "tr", "ar", "fa", "ur", "ckb", "kmr"
];
const shellKeys = ["New chat", "Log in", "History", "Settings"];
const overlayKey = "Generate an image";

assert.deepEqual(Object.keys(rows).sort(), [...codes].sort());

for (const code of codes) {
  const row = rows[code];
  assert.ok(Object.keys(row).length > 80, `${code} kept only ${Object.keys(row).length} phrases`);
  for (const key of shellKeys) {
    assert.equal(typeof row[key], "string", `${code} missing ${key}`);
    assert.notEqual(row[key].trim(), "", `${code} empty ${key}`);
    assert.notEqual(row[key], key, `${code} left ${key} in English`);
  }
  assert.equal(typeof row[overlayKey], "string", `${code} missing overlay`);
  assert.notEqual(row[overlayKey], overlayKey, `${code} left overlay in English`);
}

assert.notEqual(rows.ckb["New chat"], rows.kmr["New chat"]);
assert.notEqual(rows.ckb[overlayKey], rows.kmr[overlayKey]);
assert.notEqual(rows.fa["New chat"], rows.ar["New chat"]);
assert.notEqual(rows.ur["New chat"], rows.fa["New chat"]);

const rtl = ["fa", "ar", "ur", "ckb"];
for (const code of rtl) {
  assert.match(rows[code]["New chat"], /\p{Script=Arabic}/u, `${code} shell is not Arabic-script`);
}
assert.doesNotMatch(rows.kmr["New chat"], /\p{Script=Arabic}/u);

console.log("AI_TRANSLATIONS_TEST_OK");
