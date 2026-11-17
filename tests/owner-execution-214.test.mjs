import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("security advisory doc exists and does not claim picomatch fixed", () => {
  const doc = read("docs/security-ghsa-fc5q-39xc-vjpf.md");
  assert.match(doc, /GHSA-fc5q-39xc-vjpf/);
  assert.match(doc, /first_patched_version|First patched version/i);
  assert.match(doc, /null/);
  assert.match(doc, /stellar-wallets-kit/);
  assert.match(doc, /Do not claim the vulnerability is fixed/);
  const gate = read("scripts/npm-audit-gate.mjs");
  assert.match(gate, /ghsa-fc5q-39xc-vjpf/);
});

test("wallet distinguishes display currencies from EUR/USD settlement", () => {
  const wallet = read("wallet.html");
  assert.match(wallet, /walletDisplayCurrencyMount/);
  assert.match(wallet, /havkar-currency-select\.js/);
  assert.match(wallet, /withdrawCurrency/);
  assert.match(wallet, /Settlement currency/);
  assert.match(wallet, /Only EUR\/USD settlement is enabled/);
});

test("tickets mounts display currency selector without inventing fares", () => {
  const tickets = read("tickets.html");
  assert.match(tickets, /ticketsCurrencyMount/);
  assert.match(tickets, /havkar-currency-select\.js/);
  assert.match(tickets, /Schedules and prices are never invented/);
  assert.match(tickets, /travelMapPanel/);
});

test("central profile settings retain Support About currency language notifications", () => {
  const profile = read("profile.html");
  assert.match(profile, /goTo\('support\.html'\)|goTo\("support\.html"\)/);
  assert.match(profile, /openAbout|about\.html/);
  assert.match(profile, /checkout-currency\.html/);
  assert.match(profile, /language\.html/);
  assert.match(profile, /notifications\.html/);
});

test("future messenger remains documentation-only", () => {
  const doc = read("docs/future-messenger-integration.md");
  assert.match(doc, /does \*\*not\*\* ship|not ship|future/i);
});

test("Android and iOS identities remain online.havkar.app at 1.0.4", () => {
  const android = read("android/app/build.gradle.kts");
  assert.match(android, /applicationId = "online\.havkar\.app"/);
  assert.match(android, /versionCode = 4/);
  assert.match(android, /versionName = "1\.0\.4"/);
  const ios = read("ios/HAVKAR.xcodeproj/project.pbxproj");
  assert.match(ios, /PRODUCT_BUNDLE_IDENTIFIER = online\.havkar\.app;/);
  assert.match(ios, /MARKETING_VERSION = 1\.0\.4;/);
});

test("post-ad no longer clamps listing currency to EUR/USD only", () => {
  const post = read("post-ad.html");
  assert.match(post, /\/\^\[A-Z\]\{3\}\$/);
  assert.doesNotMatch(
    post,
    /currencyInput && currencyInput\.value === "USD"\s*\?\s*"USD"\s*:\s*"EUR"/
  );
  const services = read("havkar-services.js");
  assert.match(services, /isAllowedServiceCurrency/);
});

test("modules do not keep dead goProfile account helpers", () => {
  for (const file of [
    "buy-sell.html",
    "jobs.html",
    "services.html",
    "ads.html",
    "events.html",
    "chat.html"
  ]) {
    const html = read(file);
    assert.doesNotMatch(html, /function goProfile\s*\(/);
    assert.doesNotMatch(html, /function openProfile\s*\(/);
    assert.doesNotMatch(html, /window\.openProfile\s*=/);
  }
});
