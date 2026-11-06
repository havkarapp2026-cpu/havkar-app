const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const i18nSource = fs.readFileSync(path.join(root, "havkar-i18n.js"), "utf8");

assert.ok(i18nSource.includes("ensureBackArrowStyles"));
assert.ok(i18nSource.includes("applyDocumentLanguage"));
assert.ok(i18nSource.includes("havkar-back-arrow-direction"));
assert.ok(i18nSource.includes("i.fa-arrow-left"));
assert.ok(i18nSource.includes("scaleX(-1)"));
assert.ok(i18nSource.includes("havkar-back-glyph::before"));
assert.ok(i18nSource.includes("\\\\2039"));
assert.ok(i18nSource.includes("\\\\203A"));
assert.ok(i18nSource.includes("ckb"));
assert.ok(i18nSource.includes('dir: "rtl"'));
assert.ok(i18nSource.includes("kmr"));
assert.ok(i18nSource.includes('dir: "ltr"'));

const taxi = fs.readFileSync(path.join(root, "taxi.html"), "utf8");
const translate = fs.readFileSync(path.join(root, "translate.html"), "utf8");
assert.ok(taxi.includes('class="havkar-back-glyph"'));
assert.ok(translate.includes('class="havkar-back-glyph"'));
assert.ok(!/>‹</.test(taxi));
assert.ok(!/>\s*‹\s*</.test(translate));

const pagesWithBack = [
  "buy-sell.html",
  "support.html",
  "wallet.html",
  "jobs.html",
  "services.html",
  "ads.html",
  "profile.html"
];

pagesWithBack.forEach(function (name) {
  const html = fs.readFileSync(path.join(root, name), "utf8");
  assert.ok(html.includes("fa-arrow-left"), name + " keeps a back arrow icon");
  assert.ok(html.includes("havkar-i18n.js"), name + " loads language direction");
});

console.log("BACK_ARROW_DIRECTION_TEST_OK");
