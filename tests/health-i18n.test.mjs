import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const healthI18n = fs.readFileSync(path.join(root, "havkar-health-i18n.js"), "utf8");
const healthHtml = fs.readFileSync(path.join(root, "health.html"), "utf8");
const reviewsHtml = fs.readFileSync(path.join(root, "reviews.html"), "utf8");
const workHtml = fs.readFileSync(path.join(root, "work.html"), "utf8");
const health = require(path.join(root, "lib/havkar-health.cjs"));

assert.match(healthHtml, /havkar-health-i18n\.js/);
assert.match(healthHtml, /data-i18n="health\.title"/);
assert.match(healthHtml, /data-i18n="health\.verified_only"/);
assert.match(healthHtml, /HAVKAR_HEALTH_I18N/);
assert.match(reviewsHtml, /HAVKAR_SUPABASE_CONFIG/);
assert.match(reviewsHtml, /publishableKey/);
assert.match(workHtml, /jobs\.html/);

const langs = ["en", "it", "sv", "fa", "ckb", "kmr", "ar"];
const sandbox = {
  localStorage: {
    store: { havkar_language: "en" },
    getItem(k) {
      return this.store[k] || null;
    },
    setItem(k, v) {
      this.store[k] = String(v);
    }
  },
  document: {
    readyState: "complete",
    documentElement: { lang: "en", dir: "ltr", setAttribute() {} },
    body: null,
    querySelector() {
      return null;
    },
    addEventListener() {}
  },
  NodeFilter: { SHOW_TEXT: 4 },
  globalThis: null
};
sandbox.globalThis = sandbox;
vm.runInNewContext(healthI18n, sandbox);
const api = sandbox.HAVKAR_HEALTH_I18N;
assert.ok(api);

for (const code of langs) {
  sandbox.localStorage.store.havkar_language = code;
  assert.equal(api.lang(), code === "ku" ? "kmr" : code);
  const title = api.t("health.title");
  assert.ok(title && title.length > 2, code + " title");
  assert.ok(api.categoryLabel("gp").length > 2, code + " gp");
  assert.ok(api.groupLabel("doctors").length > 2, code + " doctors group");
  if (code === "fa" || code === "ar" || code === "ckb") {
    assert.equal(!!api.rtl[code], true, code + " rtl");
  } else {
    assert.equal(!!api.rtl[code], false, code + " ltr");
  }
}

// Sorani and Kurmanji remain separate
sandbox.localStorage.store.havkar_language = "ckb";
const ckbTitle = api.t("health.title");
sandbox.localStorage.store.havkar_language = "kmr";
const kmrTitle = api.t("health.title");
assert.notEqual(ckbTitle, kmrTitle);

// All catalog category ids have translations
for (const cat of health.HEALTH_CATEGORIES) {
  sandbox.localStorage.store.havkar_language = "fa";
  assert.ok(api.categoryLabel(cat.id, cat.label), cat.id);
}

assert.equal(health.healthLiveBillingEnabled({}), false);
assert.ok(health.subscriptionCatalog({}).plans.every((p) => p.charge_allowed_now === false));

console.log("HEALTH_I18N_TEST_OK");
