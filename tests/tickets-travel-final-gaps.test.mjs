import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  anniversaryMatch,
  cronAuthorized
} = require("../lib/travel-life-api.cjs");
const { travelPlusStatus, TRAVEL_PLUS } = require("../lib/havkar-travel-plus.cjs");

test("reminder cron accepts Vercel cron header without preconfigured secret", () => {
  const auth = cronAuthorized(
    { headers: { "x-vercel-cron": "1" }, body: {} },
    {}
  );
  assert.equal(auth.ok, true);
  assert.equal(auth.mode, "vercel_cron");
});

test("reminder cron rejects unauthorized when no vercel header", () => {
  const auth = cronAuthorized({ headers: {}, body: {} }, {});
  assert.equal(auth.ok, false);
});

test("anniversary match still year-aware", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  assert.equal(anniversaryMatch("2025-11-25T12:00:00Z", now), true);
  assert.equal(anniversaryMatch("2026-11-25T12:00:00Z", now), false);
});

test("Travel Plus stays sales-off with free GPS preserved and cancel terms", () => {
  const status = travelPlusStatus();
  assert.equal(status.sales_enabled, false);
  assert.equal(status.checkout_enabled, false);
  assert.equal(status.free_features_preserved, true);
  assert.equal(TRAVEL_PLUS.price_monthly, 4.99);
  assert.equal(TRAVEL_PLUS.trial_days, 30);
  assert.match(TRAVEL_PLUS.free_tier.join(" "), /Personal GPS/);
  assert.ok(TRAVEL_PLUS.cancel_and_renew_terms.cancel);
  assert.ok(TRAVEL_PLUS.cancel_and_renew_terms.renew);
});

test("vercel cron path for travel reminders exists", () => {
  const vercel = fs.readFileSync("vercel.json", "utf8");
  assert.match(vercel, /api\/travel-life\?action=dispatch_reminders/);
  assert.match(vercel, /20 6 \* \* \*/);
});

test("native Android FGS and iOS bridge files exist", () => {
  assert.equal(fs.existsSync("android/app/src/main/java/online/havkar/app/TravelLocationService.kt"), true);
  assert.equal(fs.existsSync("android/app/src/main/java/online/havkar/app/TravelGpsBridge.kt"), true);
  assert.equal(fs.existsSync("ios/HAVKAR/TravelLocationBridge.swift"), true);
  const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
  assert.match(manifest, /TravelLocationService/);
  assert.match(manifest, /foregroundServiceType="location"/);
  const life = fs.readFileSync("havkar-travel-life.js", "utf8");
  assert.match(life, /HAVKAR_ANDROID_TRAVEL/);
  assert.match(life, /HAVKAR_IOS_TRAVEL/);
  assert.match(life, /drainNativePoints/);
  assert.match(life, /local_trips/);
});

test("tickets UI exposes Travel Plus honesty and offline sync", () => {
  const html = fs.readFileSync("tickets.html", "utf8");
  assert.match(html, /travelPlusStatusText/);
  assert.match(html, /travelOfflineSyncBtn/);
  assert.match(html, /map-travel-plus-status/);
  assert.match(html, /external_integrations_status/);
});

test("dispatch API library includes album and yearly recap kinds", () => {
  const lib = fs.readFileSync("lib/travel-life-api.cjs", "utf8");
  assert.match(lib, /album_memories/);
  assert.match(lib, /yearly_recap/);
  assert.match(lib, /x-vercel-cron/);
});

console.log("TICKETS_TRAVEL_FINAL_GAPS_TEST_OK");
