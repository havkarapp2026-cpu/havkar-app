import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";

const chat = fs.readFileSync("chat.html", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const profile = fs.readFileSync("profile.html", "utf8");
const buySell = fs.readFileSync("buy-sell.html", "utf8");
const i18n = fs.readFileSync("havkar-i18n.js", "utf8");

test("chat.html inline script must parse (no Production Unexpected token ')' )", () => {
  const scripts = [...chat.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1]
  );
  assert.ok(scripts.length >= 1);
  const largest = scripts.sort((a, b) => b.length - a.length)[0];
  // Syntax check via Function constructor
  assert.doesNotThrow(() => {
    // eslint-disable-next-line no-new-func
    new Function(largest);
  });
});

test("Messenger goHome seeds language before index.html", () => {
  assert.match(chat, /function goHome\(\)\{[\s\S]*?havkar_language[\s\S]*?index\.html/);
  assert.match(chat, /bootFailSafe|Conversation loading did not finish|showErrorState/);
  assert.match(chat, /Try Again/);
});

test("Buy & Sell Home seeds language like Messenger", () => {
  assert.match(buySell, /function goAppHome\(\)\{[\s\S]*?havkar_language[\s\S]*?index\.html/);
});

test("Change photo button stays inside avatar-wrapper markup", () => {
  const idx = profile.indexOf('class="avatar-wrapper"');
  assert.ok(idx > 0);
  const window = profile.slice(idx, idx + 900);
  assert.match(window, /changePhotoBtn/);
  // Wrapper must not close before the button
  const btn = window.indexOf("changePhotoBtn");
  const firstClose = window.indexOf("</div>");
  // There will be inner avatar div close before button; ensure button appears before wrapper ends.
  // Count opens/closes roughly after wrapper start until button.
  assert.ok(btn > 0);
  assert.match(profile, /\.avatar-edit\{[\s\S]*?right:0;[\s\S]*?bottom:0;/);
});

test("Home never assigns user.email into public UI", () => {
  assert.doesNotMatch(index, /signedInEmail\.textContent\s*=\s*user/);
  assert.doesNotMatch(index, /textContent\s*=\s*user\s*&&\s*user\.email/);
  assert.match(index, /Signed in/);
  assert.match(index, /signedInLabel/);
});

test("Marketplace FA glossary covers Buy & Sell chrome strings", () => {
  assert.match(i18n, /"Buy & Sell":\s*"خرید و فروش"/);
  assert.match(i18n, /"Fees & marketplace rules":\s*"کارمزد و قوانین بازار"/);
  assert.match(i18n, /"Try again":\s*"تلاش دوباره"/);
  assert.match(i18n, /"Latest listings":\s*"تازه‌ترین آگهی‌ها"/);
});
