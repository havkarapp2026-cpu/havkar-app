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
assert.ok(source.includes("applyHomepageGlossary"));
assert.ok(!source.includes('"Services": "Fibre"'));

console.log("HOMEPAGE_GLOSSARY_TEST_OK");
