import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const health = require(path.join(root, "lib/havkar-health.cjs"));
const healthHtml = fs.readFileSync(path.join(root, "health.html"), "utf8");
const categoryHtml = fs.readFileSync(path.join(root, "health-category.html"), "utf8");
const ownerHtml = fs.readFileSync(path.join(root, "health-owner-review.html"), "utf8");
const applyHtml = fs.readFileSync(path.join(root, "health-provider-apply.html"), "utf8");
const i18nSrc = fs.readFileSync(path.join(root, "havkar-health-i18n.js"), "utf8");
const registry = fs.readFileSync(path.join(root, "havkar-i18n.js"), "utf8");

const LANGS21 = [
  "en", "it", "de", "fr", "es", "pt", "nl", "sv", "pl", "id",
  "zh", "ja", "ko", "hi", "ru", "ckb", "kmr", "tr", "ar", "fa", "ur"
];

assert.equal(health.HEALTH_CATEGORIES.length, 27);
assert.match(healthHtml, /health-category\.html\?id=/);
assert.match(categoryHtml, /category_id:\s*categoryId/);
assert.match(categoryHtml, /havkar-map\.js/);
assert.match(categoryHtml, /health\.empty_title/);
assert.match(ownerHtml, /health_owner_queue/);
assert.match(ownerHtml, /health_owner_verify_license/);
assert.match(applyHtml, /health-evidence/);
assert.match(applyHtml, /license_document_path/);
assert.match(applyHtml, /organization_legal_name/);
assert.ok(fs.existsSync(path.join(root, "supabase/migrations/20261116120000_health_license_documents.sql")));

for (const code of LANGS21) {
  assert.match(registry, new RegExp(`code:\\s*"${code}"`));
}

const sandbox = {
  localStorage: {
    store: { havkar_language: "en" },
    getItem(k) { return this.store[k] || null; },
    setItem(k, v) { this.store[k] = String(v); }
  },
  document: {
    readyState: "complete",
    documentElement: { lang: "en", dir: "ltr", setAttribute() {} },
    body: null,
    querySelector() { return null; },
    addEventListener() {}
  },
  globalThis: null
};
sandbox.globalThis = sandbox;
vm.runInNewContext(i18nSrc, sandbox);
const api = sandbox.HAVKAR_HEALTH_I18N;
assert.ok(api);
assert.deepEqual(Array.from(api.selectable || []), LANGS21);

for (const code of LANGS21) {
  sandbox.localStorage.store.havkar_language = code;
  assert.equal(api.lang(), code);
  const title = api.t("health.title");
  assert.ok(title && title.length > 2, code + " title");
  assert.notEqual(title, "health.title", code + " missing title key");
  for (const cat of health.HEALTH_CATEGORIES) {
    const label = api.categoryLabel(cat.id, "");
    assert.ok(label && label.length > 1, code + " " + cat.id);
  }
}

sandbox.localStorage.store.havkar_language = "ckb";
const ckb = api.t("health.title");
sandbox.localStorage.store.havkar_language = "kmr";
const kmr = api.t("health.title");
assert.notEqual(ckb, kmr);

assert.equal(health.healthLiveBillingEnabled({}), false);
assert.ok(health.subscriptionCatalog({}).plans.every((p) => p.charge_allowed_now === false));

const apiSrc = fs.readFileSync(path.join(root, "lib/havkar-health-api.cjs"), "utf8");
assert.match(apiSrc, /health_owner_queue/);
assert.match(apiSrc, /telehealth_blocked|status: "BLOCKED"/);
assert.match(apiSrc, /health_live_billing_off/);

console.log("HEALTH_CATEGORIES_21_TEST_OK");
