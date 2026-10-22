const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const page = fs.readFileSync(path.join(__dirname, "../about.html"), "utf8");
assert.ok(page.includes('src="/havkar-about-i18n.js"'));

const source = fs.readFileSync(path.join(__dirname, "../havkar-about-i18n.js"), "utf8");
for (const code of ["it", "sv", "fa", "ar", "ckb", "kmr"]) {
    assert.ok(source.includes(code + ": {"), code);
}
assert.ok(source.includes("fa: true, ar: true, ckb: true"));
assert.ok(!source.includes("kmr: true"));
assert.ok(source.includes("هاوکار چیست؟"));
assert.ok(source.includes("HAVKAR چییە؟"));
assert.ok(source.includes("HAVKAR çi ye?"));
assert.ok(source.includes("Che cos'è HAVKAR?"));
assert.ok(source.includes("Vad är HAVKAR?"));
assert.ok(source.includes("ما هي هافكار؟"));
assert.ok(source.includes("دربارهٔ هاوکار"));
assert.ok(source.includes("Informazioni su HAVKAR"));
assert.ok(source.includes("Derbarê HAVKAR"));
assert.ok(source.includes("دەربارەی HAVKAR"));
assert.ok(source.includes("حول هافكار"));
assert.ok(source.includes("Om HAVKAR"));

const sandbox = { document: { readyState: "complete", documentElement: {}, body: { childNodes: [] }, createTreeWalker: function () { return { nextNode: function () { return null; } }; }, addEventListener: function () {} }, localStorage: { getItem: function () { return "fa"; } }, NodeFilter: { SHOW_TEXT: 4 } };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.strictEqual(sandbox.document.documentElement.lang, "fa");
assert.strictEqual(sandbox.document.documentElement.dir, "rtl");

console.log("ABOUT_LOCALIZATION_TEST_OK");
