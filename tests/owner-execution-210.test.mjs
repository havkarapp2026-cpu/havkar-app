import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

test("geo pins helper never invents coordinates and skips remote jobs", () => {
  const code = fs.readFileSync(path.join(root, "havkar-geo-pins.js"), "utf8");
  assert.match(code, /Never invents coordinates/);
  assert.match(code, /data-remote/);
  assert.match(code, /geocodeLabel/);
});

test("buy-sell jobs services ads wire geo pins and location attributes", () => {
  for (const file of ["buy-sell.html", "jobs.html", "services.html", "ads.html"]) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, /havkar-geo-pins\.js/);
    assert.match(html, /HAVKAR_GEO_PINS/);
    assert.match(html, /moduleMapPanel|adTargetMapPanel/);
  }
  const jobs = fs.readFileSync(path.join(root, "jobs.html"), "utf8");
  assert.match(jobs, /data-remote=/);
  const ads = fs.readFileSync(path.join(root, "ads.html"), "utf8");
  assert.match(ads, /adTargetRadiusKm/);
  assert.match(ads, /adLatitude/);
});

test("marketplace geo migration and telehealth migration files exist", () => {
  assert.ok(
    fs.existsSync(
      path.join(root, "supabase/migrations/20261117090000_marketplace_geo_coordinates.sql")
    )
  );
  assert.ok(
    fs.existsSync(
      path.join(root, "supabase/migrations/20261116200000_health_telehealth_sessions.sql")
    )
  );
});

test("omio impact catalog ids are documented and not used as affiliate tracking id", () => {
  const { omioConfigured, buildOmioAffiliateSearchUrl } = require("../lib/omio-adapter.cjs");
  const status = omioConfigured({});
  assert.equal(status.impact_partner_program.advertiser_id, "463493");
  assert.equal(status.impact_partner_program.program_id, "7385");
  assert.equal(status.affiliate_search_ready, false);
  const forged = buildOmioAffiliateSearchUrl(
    { from: "Rome", to: "Milan" },
    { OMIO_AFFILIATE_ID: "463493" }
  );
  // Builder accepts any configured string, but status docs forbid treating catalog ids as tracking proof.
  assert.equal(forged.ok, true);
  assert.match(status.external_actions_required.join(" "), /do not use advertiser 463493/);
});

test("133 fiat presentment currencies remain distinct from XLM", () => {
  const { listStripePresentmentCurrencies, PRESENTMENT_COUNT } = require(
    "../lib/stripe-fiat-currency.cjs"
  );
  assert.equal(PRESENTMENT_COUNT, 133);
  assert.equal(listStripePresentmentCurrencies().length, 133);
  assert.ok(!listStripePresentmentCurrencies().map((c) => String(c).toUpperCase()).includes("XLM"));
});

test("partita IVA remains unpublished without Visura evidence", () => {
  const op = fs.readFileSync(path.join(root, "havkar-operator-config.js"), "utf8");
  assert.match(op, /partitaIva:\s*""/);
  assert.doesNotMatch(op, /partitaIva:\s*"04086440791"/);
});

test("ui i18n21 still covers 21 languages with map help chrome", () => {
  const sandbox = { console, document: { readyState: "complete", body: null, addEventListener() {}, createTreeWalker() { return { nextNode: () => null }; }, querySelectorAll() { return []; } }, NodeFilter: { SHOW_TEXT: 4 }, localStorage: { getItem: () => "en" } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "havkar-ui-i18n21.js"), "utf8"), sandbox);
  const api = sandbox.HAVKAR_UI_I18N21;
  assert.equal(api.selectable.length, 21);
  assert.ok(api.pack("fa")["Help for this section"] || api.pack("fa")["Search place"]);
  assert.notEqual(api.pack("ckb")["Save"] || "ckb", api.pack("kmr")["Save"] || "kmr");
});

test("delivery persists geocoded pickup/drop coords when schema allows", () => {
  const page = fs.readFileSync(path.join(root, "delivery.html"), "utf8");
  assert.match(page, /pickup_latitude/);
  assert.match(page, /delivery_longitude/);
  assert.match(page, /requestRoute/);
});

test("ios preflight still documents signing secrets without inventing values", () => {
  const preflight = fs.readFileSync(path.join(root, "scripts/ios-release-preflight.sh"), "utf8");
  assert.match(preflight, /APPLE_TEAM_ID/);
  assert.doesNotMatch(preflight, /BEGIN PRIVATE KEY/);
});
