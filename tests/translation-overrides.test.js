const assert = require("assert");
const { exactTranslationOverride } = require("../api/translate.js");

const labels = [
  "Buy & Sell",
  "Jobs",
  "Services",
  "Wallet",
  "Tickets",
  "Accommodation",
  "Ads",
  "Delivery",
  "Events",
  "Chat",
  "Languages",
  "Reviews",
  "Support",
  "HAVKAR AI",
  "About HAVKAR"
];
const languages = ["it", "fa", "ckb", "kmr", "ar", "sv"];

for (const language of languages) {
  assert.strictEqual(exactTranslationOverride("HAVKAR", language), "HAVKAR");
  assert.strictEqual(exactTranslationOverride("HAVKAR AI", language), "HAVKAR AI");
  assert.strictEqual(exactTranslationOverride("  HAVKAR   AI  ", language), "HAVKAR AI");
}

assert.strictEqual(exactTranslationOverride("Services", "it"), "Servizi");
assert.strictEqual(exactTranslationOverride("Support", "ar"), "الدعم");
assert.strictEqual(exactTranslationOverride("About HAVKAR", "fa"), "درباره HAVKAR");
assert.strictEqual(exactTranslationOverride("About HAVKAR", "ar"), "نبذة عن HAVKAR");
assert.strictEqual(exactTranslationOverride("About HAVKAR", "kmr"), "Derbarê HAVKAR de");

for (const language of languages) {
  for (const label of labels) {
    const override = exactTranslationOverride(label, language);
    const branded = label === "HAVKAR AI";
    const italianServices = label === "Services" && language === "it";
    const arabicSupport = label === "Support" && language === "ar";
    const repairedAbout = label === "About HAVKAR" && ["fa", "ar", "kmr"].includes(language);

    if (branded || italianServices || arabicSupport || repairedAbout) {
      assert.ok(override);
      assert.ok(override.includes("HAVKAR") || override === "Servizi" || override === "الدعم");
    } else {
      assert.strictEqual(override, "");
    }
  }
}

assert.strictEqual(exactTranslationOverride("Services", "fa"), "");
assert.strictEqual(exactTranslationOverride("Services", "ar"), "");
assert.strictEqual(exactTranslationOverride("Support", "it"), "");
assert.strictEqual(exactTranslationOverride("Support", "fa"), "");
assert.strictEqual(exactTranslationOverride("About HAVKAR", "it"), "");
assert.strictEqual(exactTranslationOverride("About HAVKAR", "ckb"), "");
assert.strictEqual(exactTranslationOverride("About HAVKAR", "sv"), "");
assert.strictEqual(exactTranslationOverride("Jobs", "it"), "");
assert.strictEqual(exactTranslationOverride("Wallet", "ar"), "");

console.log("TRANSLATION_OVERRIDE_TEST_OK");
