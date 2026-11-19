import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const details = fs.readFileSync("ad-details.html", "utf8");
const buySell = fs.readFileSync("buy-sell.html", "utf8");
const i18n = fs.readFileSync("havkar-i18n.js", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20261119180000_marketplace_listing_report.sql",
  "utf8"
);

test("ad-details bottom nav has Home/Search/Saved/Messages and null-safe binds", () => {
  assert.match(details, /id="navHome"/);
  assert.match(details, /id="navSearch"/);
  assert.match(details, /id="navSaved"/);
  assert.match(details, /id="navMessages"/);
  assert.match(details, /function on\(/);
  assert.match(details, /on\("navHome",\s*"click",\s*goHome\)/);
  assert.doesNotMatch(
    details,
    /\$\("navHome"\)\s*\n\s*\.addEventListener/
  );
  assert.doesNotMatch(
    details,
    /\$\("editButton"\)\s*\n\s*\.addEventListener/
  );
});

test("ad-details goHome seeds language before index.html", () => {
  assert.match(
    details,
    /function goHome\(\)\{\s*try\{[\s\S]*?havkar_language[\s\S]*?index\.html/
  );
});

test("ad-details error UI has Try again and Report path", () => {
  assert.match(details, /id="retryListingButton"/);
  assert.match(details, /id="reportButton"/);
  assert.match(details, /create_marketplace_listing_report/);
  assert.match(details, /Marketplace reporting is not armed/);
});

test("ad-details owner pause/republish uses draft/active (DB-safe)", () => {
  assert.match(details, /id="pauseButton"/);
  assert.match(details, /id="republishButton"/);
  assert.match(details, /setOwnListingStatus\("draft"\)/);
  assert.match(details, /setOwnListingStatus\("active"\)/);
  assert.match(details, /function syncOwnerLifecycleButtons/);
});

test("buy-sell explore keeps 3-column grid and real video overlay", () => {
  assert.match(buySell, /repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(buySell, /id="exploreVideoOverlay"/);
  assert.match(buySell, /function openExploreVideo/);
  assert.match(buySell, /"video_path"/);
  assert.match(buySell, /data-video-path=/);
});

test("marketplace listing report RPC keeps advertising create_ad_report untouched", () => {
  assert.match(migration, /create_marketplace_listing_report/);
  assert.match(migration, /listing_surface = 'marketplace'/);
  assert.match(migration, /cannot report own listing/);
  assert.match(migration, /SET search_path = ''/);
  // Comment may mention advertising create_ad_report(); the function body must not redefine it.
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.create_ad_report/
  );
});

test("FA glossary covers ad-details chrome used by Buy & Sell", () => {
  assert.match(i18n, /"Message Seller":\s*"پیام به فروشنده"/);
  assert.match(i18n, /"Listing unavailable":\s*"آگهی در دسترس نیست"/);
  assert.match(i18n, /"Report":\s*"گزارش"/);
});
