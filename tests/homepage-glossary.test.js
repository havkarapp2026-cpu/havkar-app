const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
    path.join(__dirname, "../havkar-i18n.js"),
    "utf8"
);

assert.ok(source.includes('"Services": "Servizi"'));
assert.ok(source.includes('"Buy & Sell": "Compra e vendi"'));
assert.ok(source.includes('"Buy & Sell": "Kaufen & Verkaufen"'));
assert.ok(source.includes('"Services": "Dienste"'));
assert.ok(source.includes('"Buy & Sell": "خرید و فروش"'));
assert.ok(source.includes('"Services": "خدمات"'));
assert.ok(source.includes('"Buy & Sell": "Köp & sälj"'));
assert.ok(source.includes("fa: Object.freeze({"));
assert.ok(source.includes("ckb: Object.freeze({"));
assert.ok(source.includes("kmr: Object.freeze({"));
assert.ok(source.includes("sv: Object.freeze({"));
assert.ok(source.includes("homepageGlossary(targetLanguage)"));
assert.ok(source.includes("marketplaceGlossary(targetLanguage)"));
assert.ok(source.includes("messagingGlossary(targetLanguage)"));
assert.ok(source.includes("MESSAGING_GLOSSARY"));
assert.ok(source.includes("applyHomepageGlossary"));
assert.ok(!source.includes('"Services": "Fibre"'));

console.log("HOMEPAGE_GLOSSARY_TEST_OK");
