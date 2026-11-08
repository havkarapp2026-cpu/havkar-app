import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(import.meta.url);
const adsHelpers = require("../havkar-ads.js");

test("ads helpers validate payload and keep advertising surface", () => {
  assert.equal(adsHelpers.isAdvertisingSurface({ listing_surface: "advertising" }), true);
  assert.equal(adsHelpers.isAdvertisingSurface({ listing_surface: "marketplace" }), false);
  assert.match(adsHelpers.detailUrl(42), /ad-view\.html\?id=42/);

  const bad = adsHelpers.validateCreatePayload({
    title: "",
    category: "shop",
    location: "Milan",
    description: "x"
  });
  assert.equal(bad.ok, false);

  const good = adsHelpers.validateCreatePayload({
    title: "Lunch deal",
    category: "restaurant",
    location: "Milan",
    description: "20% off",
    country_code: "it",
    city: "Milan",
    target_audience: "office workers",
    starts_at: "2030-01-01T10:00:00.000Z",
    expires_at: "2030-01-31T10:00:00.000Z"
  });
  assert.equal(good.ok, true);
  assert.equal(good.payload.listing_surface, "advertising");
  assert.equal(good.payload.status, "pending_review");
  assert.equal(good.payload.country_code, "IT");
});

test("ads production files keep Buy & Sell / AI separation and Stripe test gates", () => {
  const adsHtml = fs.readFileSync(path.join(root, "ads.html"), "utf8");
  const adView = fs.readFileSync(path.join(root, "ad-view.html"), "utf8");
  const adDetails = fs.readFileSync(path.join(root, "ad-details.html"), "utf8");
  const saved = fs.readFileSync(path.join(root, "saved.html"), "utf8");
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20261108010000_ads_production_lifecycle.sql"),
    "utf8"
  );
  const boostApi = fs.readFileSync(path.join(root, "lib/ad-boost-checkout.cjs"), "utf8");
  const boostHook = fs.readFileSync(path.join(root, "lib/ad-boost-webhook.cjs"), "utf8");
  const checkoutRouter = fs.readFileSync(path.join(root, "api/create-event-checkout.js"), "utf8");
  const stripeWebhook = fs.readFileSync(path.join(root, "api/stripe-webhook.js"), "utf8");
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const ai = fs.readFileSync(path.join(root, "havkar-ai.html"), "utf8");
  const admin = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  const apiCount = fs.readdirSync(path.join(root, "api")).filter((name) => name.endsWith(".js")).length;

  assert.match(adsHtml, /listing_surface:\s*"advertising"|listing_surface:\s*\n\s*"advertising"|listing_surface:\s*"advertising"/);
  assert.match(adsHtml, /business_applications/);
  assert.match(adsHtml, /HAVKAR_ADS/);
  assert.match(adsHtml, /ad-view\.html/);
  assert.match(adsHtml, /pending_review|adPreviewBox/);

  assert.match(adView, /create_ad_report/);
  assert.match(adView, /moderate_advertisement/);
  assert.match(adView, /create-ad-boost-checkout/);
  assert.match(adView, /test_mode: true/);
  assert.doesNotMatch(adView, /from\("marketplace_listings"\)/);

  assert.match(adDetails, /ad-view\.html\?id=/);
  assert.match(saved, /ad-view\.html\?id=/);

  assert.match(migration, /caller_is_approved_advertiser/);
  assert.match(migration, /ad_campaigns/);
  assert.match(migration, /ad_reports/);
  assert.match(migration, /ad_audit_events/);
  assert.match(migration, /ad_metric_events/);
  assert.match(migration, /ad_boost_intents/);
  assert.match(migration, /ad_saves_select_own/);
  assert.match(migration, /moderate_advertisement/);

  assert.match(boostApi, /HAVKAR_ADS_BOOST_TEST_ENABLED/);
  assert.match(boostApi, /sk_test_/);
  assert.match(boostApi, /test_mode !== true/);
  assert.doesNotMatch(boostApi, /HAVKAR_REAL_PAYMENTS_ENABLED === "true"/);
  assert.match(checkoutRouter, /havkarAction === "adBoost"/);
  assert.match(checkoutRouter, /handleAdBoostCheckout/);

  assert.match(boostHook, /HAVKAR_ADS_BOOST_TEST_ENABLED/);
  assert.match(boostHook, /havkar_flow === "ad_boost"/);
  assert.match(stripeWebhook, /tryConstructAdsBoostEvent/);
  assert.match(stripeWebhook, /processAdsBoostEvent/);

  assert.ok(
    vercel.rewrites.some(
      (rule) =>
        rule.source === "/api/create-ad-boost-checkout" &&
        rule.destination === "/api/create-event-checkout?havkarAction=adBoost"
    )
  );
  assert.ok(
    vercel.rewrites.some(
      (rule) =>
        rule.source === "/api/ad-boost-webhook" &&
        rule.destination === "/api/stripe-webhook"
    )
  );
  assert.equal(apiCount, 12);
  assert.equal(fs.existsSync(path.join(root, "api/create-ad-boost-checkout.js")), false);
  assert.equal(fs.existsSync(path.join(root, "api/ad-boost-webhook.js")), false);

  assert.doesNotMatch(ai, /\.from\(["']ads["']\)\.insert/);
  assert.match(admin, /adsModeration/);
  assert.match(admin, /moderate_advertisement/);
  assert.match(admin, /pending_review/);
});

test("ads visibility helper respects schedule and status", () => {
  const now = Date.parse("2030-01-15T12:00:00.000Z");
  assert.equal(
    adsHelpers.isPubliclyVisible({
      listing_surface: "advertising",
      status: "active",
      starts_at: "2030-01-01T00:00:00.000Z",
      expires_at: "2030-02-01T00:00:00.000Z"
    }, now),
    true
  );
  assert.equal(
    adsHelpers.isPubliclyVisible({
      listing_surface: "advertising",
      status: "pending_review"
    }, now),
    false
  );
  assert.equal(
    adsHelpers.isPubliclyVisible({
      listing_surface: "marketplace",
      status: "active"
    }, now),
    false
  );
});
