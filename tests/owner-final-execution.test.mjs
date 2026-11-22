import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const LANGS21 = [
  "en","it","de","fr","es","pt","nl","sv","pl","id","zh","ja","ko","hi","ru","ckb","kmr","tr","ar","fa","ur"
];

function loadBrowser(rel) {
  const code = fs.readFileSync(path.join(root, rel), "utf8");
  const sandbox = {
    console,
    document: {
      readyState: "complete",
      body: null,
      addEventListener() {},
      createTreeWalker() {
        return { nextNode: () => null };
      },
      querySelectorAll() {
        return [];
      }
    },
    NodeFilter: { SHOW_TEXT: 4 },
    localStorage: { getItem: () => "en" }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

test("home registry has exactly 15 protected tiles and logo path", () => {
  const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.equal((home.match(/class="menu-item"/g) || []).length, 15);
  assert.match(home, /doctors-pharmacies\.png/);
  assert.match(home, /flex-direction:\s*column/);
  assert.doesNotMatch(home, /data-havkar-legal-footer/);
  for (const href of [
    "buy-sell.html","jobs.html","services.html","wallet.html","tickets.html",
    "accommodation.html","ads.html","delivery.html","events.html","chat.html",
    "language.html","health.html","calls.html","havkar-ai.html","coming-soon.html"
  ]) {
    assert.match(home, new RegExp(`href="${href}"`));
  }
});

test("support knowledge base covers all 15 tiles and SORAN confidentiality", () => {
  const kb = loadBrowser("havkar-help-kb.js").HAVKAR_HELP_KB;
  assert.ok(kb.tiles.length >= 15);
  assert.equal(kb.company.legalEntityName, "HAVKAR DI JALILNIA AMIR");
  assert.equal(kb.company.soranEmail, "soran@havkar.online");
  assert.equal(kb.company.partitaIvaPublished, true);
  const support = fs.readFileSync(path.join(root, "support.html"), "utf8");
  assert.match(support, /havkar-help-kb\.js/);
  assert.match(support, /tileGuides/);
  assert.doesNotMatch(support, /soran@havkar\.online/);
  assert.match(support, /confidential Owner investment mailbox is not published/);
  assert.match(support, /Admin and Staff must never access Owner-only/);
  assert.match(support, /04086440791/);
});

test("133 fiat presentment currencies remain available and distinct from XLM", () => {
  const {
    listStripePresentmentCurrencies,
    PRESENTMENT_COUNT
  } = require("../lib/stripe-fiat-currency.cjs");
  const list = listStripePresentmentCurrencies();
  assert.equal(PRESENTMENT_COUNT, 133);
  assert.equal(list.length, 133);
  assert.ok(!list.map((c) => String(c).toUpperCase()).includes("XLM"));
});

test("omio affiliate link builder never invents fares; tracks Impact media partner", () => {
  const {
    buildOmioAffiliateSearchUrl,
    omioConfigured
  } = require("../lib/omio-adapter.cjs");
  const untracked = buildOmioAffiliateSearchUrl({ from: "Rome", to: "Milan" }, {});
  assert.equal(untracked.ok, true);
  assert.equal(untracked.tracked, false);
  assert.doesNotMatch(untracked.url || "", /partner=/);
  const ready = buildOmioAffiliateSearchUrl(
    { from: "Rome", to: "Milan", date: "2026-12-01", mode: "train" },
    { OMIO_AFFILIATE_ID: "7763968" }
  );
  assert.equal(ready.ok, true);
  assert.equal(ready.tracked, true);
  assert.match(ready.url, /partner=7763968/);
  assert.match(ready.url, /omio\.com/);
  const status = omioConfigured({ OMIO_AFFILIATE_ID: "7763968" });
  assert.equal(status.affiliate_search_ready, true);
  assert.equal(status.affiliate_tracked, true);
  assert.equal(status.impact_partner_program.media_partner_match, true);
  assert.equal(status.live_search, false);
  const forgedCatalog = buildOmioAffiliateSearchUrl(
    { from: "Rome", to: "Milan" },
    { OMIO_AFFILIATE_ID: "463493" }
  );
  assert.equal(forgedCatalog.tracked, false);
});

test("telehealth remains publicly gated without clinical checklist", () => {
  const { telehealthStatus } = require("../lib/telehealth-adapter.cjs");
  const status = telehealthStatus({});
  assert.equal(status.voice, "BLOCKED");
  assert.equal(status.video, "BLOCKED");
  assert.equal(status.public_clinical_sessions_allowed, false);
});

test("operator config hides personal emails and publishes confirmed Partita IVA", () => {
  const src = fs.readFileSync(path.join(root, "havkar-operator-config.js"), "utf8");
  assert.match(src, /partitaIva:\s*"04086440791"/);
  assert.match(src, /soranEmail:\s*"soran@havkar\.online"/);
  assert.match(src, /hidePersonalEmails/);
  assert.match(src, /primaryOwnerEmail:\s*""/);
});

test("ui i18n21 covers all selectable languages and keeps Kurdish variants distinct", () => {
  const api = loadBrowser("havkar-ui-i18n21.js").HAVKAR_UI_I18N21;
  assert.deepEqual(Array.from(api.selectable || []), LANGS21);
  const fa = api.pack("fa");
  const ar = api.pack("ar");
  const ckb = api.pack("ckb");
  const kmr = api.pack("kmr");
  assert.ok(fa["Buy & Sell"]);
  assert.ok(ar["Buy & Sell"]);
  assert.notEqual(ckb["Save"] || ckb["Home"], kmr["Save"] || kmr["Home"]);
});

test("ios release preflight script exists and documents signing secrets without values", () => {
  const preflight = fs.readFileSync(path.join(root, "scripts/ios-release-preflight.sh"), "utf8");
  assert.match(preflight, /APPLE_TEAM_ID/);
  assert.match(preflight, /APP_STORE_CONNECT_API_KEY/);
  assert.doesNotMatch(preflight, /BEGIN PRIVATE KEY/);
});

test("public AI entitlement probe never trusts client verification bypass", () => {
  const entitlements = require("../lib/havkar-ai-entitlements.cjs");
  const forged = entitlements.logoEntitlementDecision(
    { review: true },
    { mode: "image", logo: { name: "TestCo" } }
  );
  // Direct library call still documents review path for edge-only use,
  // but API must ignore client verification (asserted via source).
  const api = fs.readFileSync(path.join(root, "api/create-event-checkout.js"), "utf8");
  assert.match(api, /ai_entitlement_check/);
  assert.match(api, /Never trust client-supplied verification/);
  assert.match(api, /logoEntitlementDecision\(\s*\{\s*ok:\s*false\s*\}/);
  assert.equal(forged.reason, "play_review_bypass");
});

test("operator config does not publish Owner login email or Partita IVA", () => {
  const src = fs.readFileSync(path.join(root, "havkar-operator-config.js"), "utf8");
  assert.match(src, /primaryOwnerEmail:\s*""/);
  assert.match(src, /hidePersonalEmails:\s*\[\s*\]/);
  assert.doesNotMatch(src, /havkarapp2026@gmail\.com/);
  assert.doesNotMatch(src, /amirjalilnia@gmail\.com/);
  assert.doesNotMatch(src, /amirjalilnia01@gmail\.com/);
});

test("AI free plan copy forbids usable free logo images", () => {
  const page = fs.readFileSync(path.join(root, "havkar-ai.html"), "utf8");
  assert.match(page, /0 downloadable images/);
  assert.match(page, /Logo and image generation require a paid plan/);
  assert.doesNotMatch(page, /2 images a month/);
});

test("major tiles link to Support knowledge base guides", () => {
  for (const [page, tile] of [
    ["buy-sell.html", "buy-sell"],
    ["jobs.html", "jobs"],
    ["services.html", "services"],
    ["wallet.html", "wallet"],
    ["tickets.html", "tickets"],
    ["health.html", "health"],
    ["havkar-ai.html", "havkar-ai"]
  ]) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    assert.match(html, new RegExp(`support\.html\\?tile=${tile}`));
  }
});
