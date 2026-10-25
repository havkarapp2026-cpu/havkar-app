import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "havkar-preview-access.js"), "utf8");
const token = "DummyShareToken1234";

function boot(href, storage) {
  const location = new URL(href);
  const store = storage || new Map();
  let replaced = "";
  const anchors = [];
  const document = {
    readyState: "complete",
    addEventListener() {},
    querySelectorAll() {
      return anchors;
    }
  };
  const context = {
    location,
    document,
    history: {
      state: null,
      replaceState(_state, _title, next) {
        replaced = next;
      }
    },
    sessionStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, value); }
    },
    URL,
    URLSearchParams,
    Location: function Location() {},
    window: null
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "havkar-preview-access.js" });
  return { context, replaced, store };
}

const preview = boot(`https://havkar-preview-test.vercel.app/events.html?havkar_share=${token}`);
const loginHref = preview.context.havkarWithPreviewAccess("login.html?return=events.html");
const loginUrl = new URL(loginHref);
assert.equal(loginUrl.origin, "https://havkar-preview-test.vercel.app");
assert.equal(loginUrl.pathname, "/login.html");
assert.equal(loginUrl.searchParams.get("return"), "events.html");
assert.equal(loginUrl.searchParams.get("havkar_share"), token);
assert.equal(loginUrl.searchParams.get("_vercel_share"), token);
assert.equal(loginUrl.searchParams.get("x-vercel-set-bypass-cookie"), "samesitenone");
assert.equal(preview.store.get("havkar_preview_share"), token);

const external = new URL(preview.context.havkarWithPreviewAccess("https://accounts.google.com/o/oauth2/auth"));
assert.equal(external.searchParams.get("_vercel_share"), null);
assert.equal(external.searchParams.get("havkar_share"), null);

const fromShare = boot(`https://havkar-preview-test.vercel.app/events.html?_vercel_share=${token}`);
assert.equal(new URL(fromShare.context.havkarWithPreviewAccess("signup.html")).searchParams.get("havkar_share"), token);
assert.equal(fromShare.replaced.includes("havkar_share=" + token), true);

const production = boot("https://havkar-app.vercel.app/events.html");
const productionHref = new URL(production.context.havkarWithPreviewAccess("login.html"));
assert.equal(productionHref.searchParams.get("_vercel_share"), null);
assert.equal(productionHref.searchParams.get("havkar_share"), null);

const invalid = boot("https://havkar-preview-test.vercel.app/events.html?havkar_share=short");
assert.equal(new URL(invalid.context.havkarWithPreviewAccess("login.html")).searchParams.get("_vercel_share"), null);

for (const file of ["login.html", "signup.html", "events.html", "index.html", "jobs.html"]) {
  assert.match(fs.readFileSync(path.join(root, file), "utf8"), /havkar-preview-access\.js/);
}
assert.match(fs.readFileSync(path.join(root, "havkar-stellar-checkout.js"), "utf8"), /havkarWithPreviewAccess/);
assert.match(fs.readFileSync(path.join(root, "signup.html"), "utf8"), /emailRedirectTo:loginReturnHref\(\)/);

console.log("PREVIEW_ACCESS_OK");
