import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const login = fs.readFileSync(path.join(root, "login.html"), "utf8");
const signup = fs.readFileSync(path.join(root, "signup.html"), "utf8");
const checkout = fs.readFileSync(path.join(root, "havkar-stellar-checkout.js"), "utf8");
const events = fs.readFileSync(path.join(root, "events.html"), "utf8");

const allowed = ["events.html", "index.html", "jobs.html", "wallet.html", "tickets.html"];

function sliceFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`);
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end);
}

function safeReturnTarget(search) {
  const body = sliceFunction(login, "safeReturnTarget", "continueHref");
  return new Function(
    "window",
    `${body}; return safeReturnTarget();`
  )({ location: { search } });
}

function sameOriginLoginHref(pathname) {
  const body = sliceFunction(checkout, "sameOriginLoginHref", "direction");
  return new Function(
    "window",
    `${body}; return sameOriginLoginHref();`
  )({ location: { pathname } });
}

for (const page of allowed) {
  assert.equal(safeReturnTarget(`?return=${encodeURIComponent(page)}`), page);
  assert.equal(sameOriginLoginHref(`/${page}`), `login.html?return=${encodeURIComponent(page)}`);
}

for (const rejected of [
  "",
  "?return=",
  "?return=https://evil.example/events.html",
  "?return=//evil.example",
  "?return=events.html/../../login.html",
  "?return=profile.html",
  "?return=login.html",
  "?return=events.html?next=https://evil.example",
  "?return=%2F%2Fevil.example"
]) {
  assert.equal(safeReturnTarget(rejected), "", rejected);
}

assert.equal(sameOriginLoginHref("/profile.html"), "login.html?return=events.html");
assert.equal(sameOriginLoginHref("/"), "login.html?return=events.html");

assert.match(login, /redirectToUrl\.searchParams\.set\("return", returnTarget\)/);
assert.match(login, /signup\.html\?return=/);
assert.match(login, /window\.location\.replace\(\s*continueHref\(\)\s*\)/);
assert.doesNotMatch(login, /window\.location\.replace\(\s*"index\.html"\s*\)/);

assert.match(signup, /function safeReturnTarget\(\)/);
assert.match(signup, /emailRedirectTo:loginReturnHref\(\)/);
assert.match(signup, /redirectTo:loginReturnHref\(\)/);
assert.match(signup, /location\.href=continueHref\(\)/);
assert.doesNotMatch(signup, /location\.href='index\.html'/);

assert.match(checkout, /throw new Error\("Authentication required\."\)/);
assert.match(checkout, /Authorization: `Bearer \$\{token\}`/);
assert.match(checkout, /havkarReserveStellarSigningWindow\(\)/);
assert.match(checkout, /action: "prepare"/);
const reserveAt = checkout.indexOf("havkarReserveStellarSigningWindow()");
const prepareAt = checkout.indexOf('action: "prepare"');
assert.equal(reserveAt > 0 && reserveAt < prepareAt, true);
assert.match(checkout, /AbortController/);
assert.match(checkout, /readyToSign/);
for (const language of ["en", "fa", "ar", "it", "sv", "ckb", "kmr"]) {
  assert.match(checkout, new RegExp(`${language}:\\s*\\{[\\s\\S]*?signInRequired:`));
  assert.match(checkout, new RegExp(`${language}:\\s*\\{[\\s\\S]*?signIn:`));
}

assert.match(events, /login\.html\?return=events\.html/);
assert.match(events, /login\.html\?return=" \+ encodeURIComponent\("events\.html"\)/);
assert.doesNotMatch(checkout, /localStorage\.setItem\([^)]*auth-token/);

console.log("CHECKOUT_SIGNIN_RETURN_OK");
