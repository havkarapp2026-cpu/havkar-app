"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const market = require("../havkar-marketplace.js");

const root = path.join(__dirname, "..");
const buySell = fs.readFileSync(path.join(root, "buy-sell.html"), "utf8");
const ads = fs.readFileSync(path.join(root, "ads.html"), "utf8");
const postAd = fs.readFileSync(path.join(root, "post-ad.html"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261103223000_marketplace_surface_and_media.sql"),
  "utf8"
);

assert.strictEqual(market.quoteListingFees(100).buyerFee, 2);
assert.strictEqual(market.quoteListingFees(100).sellerFee, 3);
assert.strictEqual(market.quoteListingFees(100).buyerPays, 102);
assert.strictEqual(market.quoteListingFees(100).sellerReceives, 97);
assert.strictEqual(market.quoteListingFees(100).listingPublicationFee, 0);
assert.strictEqual(market.quoteListingFees(100).tax, null);

assert.strictEqual(market.isMarketplaceRow({ listing_surface: "marketplace" }), true);
assert.strictEqual(market.isMarketplaceRow({}), true);
assert.strictEqual(market.isAdvertisingRow({ listing_surface: "marketplace" }), false);
assert.strictEqual(market.isAdvertisingRow({ listing_surface: "advertising" }), true);

assert.strictEqual(
  market.validateListingVideo({ type: "video/mp4", size: 1000 }, 12).ok,
  true
);
assert.strictEqual(
  market.validateListingVideo({ type: "video/quicktime", size: 1000 }, 12).ok,
  false
);
assert.strictEqual(
  market.validateListingVideo({ type: "video/mp4", size: 16 * 1024 * 1024 }, 12).ok,
  false
);
assert.strictEqual(
  market.validateListingVideo({ type: "video/mp4", size: 1000 }, 45).ok,
  false
);

assert.ok(buySell.includes('data-havkar-parent="index.html"'));
assert.ok(buySell.includes("goHome();"));
assert.ok(buySell.includes("listing_surface.eq.marketplace"));
assert.ok(!buySell.includes("listing_surface.eq.advertising"));

assert.ok(postAd.includes('listing_surface:\n          "marketplace"') || postAd.includes('"marketplace"'));
assert.ok(postAd.includes("validateListingVideo"));
assert.ok(postAd.includes("uploadListingVideo"));
assert.ok(postAd.includes("video_path:"));
assert.ok(postAd.includes('id="draftBtn"'));
assert.ok(postAd.includes('id="currency"'));
assert.ok(!postAd.includes('listing_surface:\n          "advertising"'));

assert.ok(ads.includes('"advertising"'));
assert.ok(ads.includes('.eq(\n                        "listing_surface",\n                        "advertising"\n                    )'));

assert.ok(migration.includes("listing_surface = 'marketplace'"));
assert.ok(migration.includes("listing_surface = 'advertising'"));
assert.ok(migration.includes("'restaurant', 'shop', 'service', 'other'"));
assert.ok(migration.includes("marketplace-media"));
assert.ok(migration.includes("CREATE TRIGGER enforce_ad_listing_status"));
assert.ok(migration.includes("status = 'unpaid'"));
assert.ok(!migration.includes("DELETE FROM public.ads"));
assert.ok(!migration.includes("STELLAR_MAINNET"));

const owner = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";
assert.strictEqual(
  market.listingVideoObjectPath(owner, "video/mp4", objectId).path,
  owner + "/" + objectId + ".mp4"
);
assert.strictEqual(market.listingVideoObjectPath("../etc", "video/mp4", objectId).ok, false);
assert.strictEqual(market.listingVideoObjectPath(owner, "video/quicktime", objectId).ok, false);

const details = fs.readFileSync(path.join(root, "ad-details.html"), "utf8");
assert.ok(details.includes("isAdvertisingRow"));
assert.ok(details.includes("signedListingVideoUrl"));
assert.ok(!details.includes("getPublicUrl"));
assert.ok(buySell.includes("isAdvertisingRow"));

const product = fs.readFileSync(path.join(root, "product.html"), "utf8");
assert.ok(product.includes('listing_surface === "advertising"'));

console.log("MARKETPLACE_ISOLATION_TEST_OK");
