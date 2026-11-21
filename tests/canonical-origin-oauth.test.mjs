import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("havkar-canonical-origin.js", "utf8");
const sandbox = { window: {}, globalThis: {}, URL };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox);
const api = sandbox.window.HAVKAR_CANONICAL;

assert.equal(api.origin, "https://havkar.online");
assert.equal(api.canonicalOrigin("https://havkar.online/login.html"), "https://havkar.online");
assert.equal(api.canonicalOrigin("https://www.havkar.online/"), "https://havkar.online");
assert.equal(api.canonicalOrigin("https://havkar-app.vercel.app/login.html"), "https://havkar.online");
assert.equal(
  api.authRedirectUrl("login.html", "https://havkar-app.vercel.app/"),
  "https://havkar.online/login.html"
);
assert.equal(
  api.authRedirectUrl("login.html?next=%2Fowner-eur1-checkout.html", "https://havkar.online/"),
  "https://havkar.online/login.html?next=%2Fowner-eur1-checkout.html"
);
const previewHost =
  "https://havkar-app-git-cursor-buyse-abdee9-havkarapp2026-4055s-projects.vercel.app";
assert.equal(api.isVercelPreviewHost(new URL(previewHost).hostname), true);
assert.equal(api.canonicalOrigin(previewHost + "/buy-sell.html"), previewHost);
assert.equal(
  api.authRedirectUrl("login.html", previewHost + "/buy-sell.html"),
  previewHost + "/login.html"
);
assert.equal(
  api.sameOriginPathUrl("/login.html?next=%2Fbuy-sell.html", previewHost + "/"),
  previewHost + "/login.html?next=%2Fbuy-sell.html"
);
assert.equal(api.safeNextPath("/owner-eur1-checkout.html"), "/owner-eur1-checkout.html");
assert.equal(api.safeNextPath("https://evil.example/"), "");
assert.equal(api.safeNextPath("//evil.example"), "");

const login = fs.readFileSync("login.html", "utf8");
assert.match(login, /havkar-canonical-origin\.js/);
assert.match(login, /HAVKAR_CANONICAL\.authRedirectUrl/);
assert.match(login, /safeNextPath/);

const signup = fs.readFileSync("signup.html", "utf8");
assert.match(signup, /havkar-canonical-origin\.js/);
assert.match(signup, /authRedirect\('login\.html'\)/);

const owner = fs.readFileSync("owner-eur1-checkout.html", "utf8");
assert.match(owner, /login\.html\?next=/);
assert.match(owner, /havkar-canonical-origin\.js/);
assert.doesNotMatch(owner, /localStorage\.setItem\(["']sb-/);

const vercel = fs.readFileSync("vercel.json", "utf8");
assert.match(vercel, /havkar-app\.vercel\.app/);
assert.match(vercel, /https:\/\/havkar\.online\/:path\*/);

const checkout = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(checkout, /return "https:\/\/havkar\.online"/);

console.log("CANONICAL_ORIGIN_OAUTH_TEST_OK");
