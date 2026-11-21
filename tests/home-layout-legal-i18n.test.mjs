import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("home uses column flex and wider tablet container", () => {
  const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(home, /flex-direction:\s*column/);
  assert.match(home, /max-width:\s*720px/);
  assert.match(home, /data-havkar-home="1"/);
  assert.equal((home.match(/class="menu-item"/g) || []).length, 15);
  assert.match(home, /doctors-pharmacies\.png/);
  assert.doesNotMatch(home, /data-havkar-legal-footer/);
  assert.doesNotMatch(home, /havkar-legal-footer\.js/);
});

test("legal footer skips home and remains on about/privacy/terms", () => {
  const footer = fs.readFileSync(path.join(root, "havkar-legal-footer.js"), "utf8");
  assert.match(footer, /isHomePage/);
  assert.match(footer, /Never inject operator\/legal/);
  for (const file of ["about.html", "privacy.html", "terms.html"]) {
    const src = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(src, /data-havkar-legal-footer/);
    assert.match(src, /havkar-legal-footer\.js/);
  }
});

test("ui i18n21 still covers 21 langs with profile/forms/legal", () => {
  const code = fs.readFileSync(path.join(root, "havkar-ui-i18n21.js"), "utf8");
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const api = sandbox.HAVKAR_UI_I18N21;
  assert.equal(api.selectable.length, 21);
  const fa = api.pack("fa");
  assert.ok(fa["Sign out"]);
  assert.ok(fa["Required field"]);
  assert.ok(fa["Company information"]);
  assert.ok(fa["Book now"]);
  assert.ok(fa["Health categories"]);
  assert.ok(fa["Dashboard"]);
  assert.ok(fa["Reset filters"]);
  assert.ok(fa["Delivered"]);
  assert.notEqual(api.pack("ckb")["Save"], api.pack("kmr")["Save"]);
  assert.notEqual(api.pack("ckb")["Book now"], api.pack("kmr")["Book now"]);
  for (const section of ["hotels", "health", "filters", "admin", "notifications", "delivery"]) {
    assert.ok(api.glossaries[section], section);
    assert.equal(Object.keys(api.glossaries[section]).length, 20);
  }
});
