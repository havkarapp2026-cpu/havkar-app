"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const market = require("../havkar-marketplace.js");

const root = path.join(__dirname, "..");
const postAd = fs.readFileSync(path.join(root, "post-ad.html"), "utf8");
const buySell = fs.readFileSync(path.join(root, "buy-sell.html"), "utf8");
const ads = fs.readFileSync(path.join(root, "ads.html"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const lifecycle = fs.readFileSync(
  path.join(root, "supabase/migrations/20261108010000_ads_production_lifecycle.sql"),
  "utf8"
);

assert.strictEqual(market.LISTING_PUBLICATION_FEE, 0);
assert.strictEqual(market.quoteListingFees(100).buyerFee, 2);
assert.strictEqual(market.quoteListingFees(100).sellerFee, 3);
assert.strictEqual(market.quoteListingFees(100).listingPublicationFee, 0);

assert.ok(postAd.includes('listing_surface:\n          "marketplace"'));
assert.ok(!postAd.includes('listing_surface:\n          "advertising"'));
assert.ok(postAd.includes("Create a free listing"));
assert.ok(postAd.includes("No payment, business verification, Owner role, or subscription is required."));
assert.ok(postAd.includes('login.html?next='));
assert.ok(postAd.includes("requireListingPublisherSession"));
assert.ok(postAd.includes("Publication is free."));

assert.ok(buySell.includes('encodeURIComponent(\n                            "/post-ad.html"\n                        )'));
assert.ok(buySell.includes("resolveCurrentUser"));
assert.ok(buySell.includes("listing_surface.eq.marketplace"));
assert.ok(!buySell.includes("listing_surface.eq.advertising"));

assert.ok(ads.includes("Business Ads"));
assert.ok(ads.includes('href="buy-sell.html"'));
assert.ok(ads.includes("For free personal listings open Buy & Sell."));
assert.ok(ads.includes('"advertising"'));

assert.ok(index.includes("Free personal listings"));
assert.ok(index.includes("Business Ads"));
assert.ok(index.includes("Approved businesses only"));
assert.ok(index.includes('href="buy-sell.html"'));
assert.ok(index.includes('href="ads.html"'));

assert.ok(lifecycle.includes("caller_is_approved_advertiser"));
assert.ok(lifecycle.includes("listing_surface = 'marketplace'"));
assert.ok(lifecycle.includes("only approved business advertisers can publish ads"));
assert.ok(lifecycle.includes("marketplace listings must use status draft or active"));
assert.ok(!lifecycle.includes("STELLAR_MAINNET"));
assert.ok(!lifecycle.includes("DELETE FROM public.ads"));

console.log("MARKETPLACE_FREE_PUBLISH_TEST_OK");
