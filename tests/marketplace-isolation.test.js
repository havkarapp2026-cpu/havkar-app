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
  true
);
assert.strictEqual(
  market.validateListingVideo({ type: "video/mp4", size: 1000 }, 60).ok,
  true
);
assert.strictEqual(
  market.validateListingVideo({ type: "video/mp4", size: 1000 }, 61).ok,
  false
);
assert.strictEqual(market.MAX_VIDEO_SECONDS, 60);

const listingId = "33333333-3333-4333-8333-333333333333";
assert.strictEqual(
  market.listingShareUrl("https://havkar-app.vercel.app/buy-sell.html", listingId),
  "https://havkar-app.vercel.app/ad-details.html?id=" + listingId
);
assert.strictEqual(market.listingShareUrl("https://havkar-app.vercel.app", "not an id"), "");
assert.strictEqual(market.listingShareUrl("javascript:alert(1)", listingId), "");

const rows = [
  { city: "Rome", price: 20 },
  { city: " rome ", price: 40 },
  { city: "Milan", price: 80 }
];
assert.deepStrictEqual(market.listingCities(rows), ["Milan", "Rome"]);
assert.strictEqual(
  market.listingMatchesPriceAndCity(rows[0], { city: "Rome", minPrice: "10", maxPrice: "30" }),
  true
);
assert.strictEqual(
  market.listingMatchesPriceAndCity(rows[2], { city: "Rome", minPrice: "", maxPrice: "" }),
  false
);
assert.strictEqual(
  market.listingMatchesPriceAndCity(rows[2], { city: "", minPrice: "90", maxPrice: "" }),
  false
);
assert.strictEqual(
  market.listingMatchesPriceAndCity(rows[0], { city: "", minPrice: "40", maxPrice: "10" }),
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
assert.ok(buySell.includes('id="cityFilter"'));
assert.ok(buySell.includes('id="minPrice"'));
assert.ok(buySell.includes('id="maxPrice"'));
assert.ok(buySell.includes("listingMatchesPriceAndCity"));
assert.ok(buySell.includes('data-share-id='));
assert.ok(buySell.includes('window.location.href =\n                    "notifications.html"'));
assert.ok(!buySell.includes("Notifications will appear here."));

const sixty = fs.readFileSync(
  path.join(root, "supabase/migrations/20261106010000_marketplace_video_sixty_seconds.sql"),
  "utf8"
);
assert.ok(sixty.includes("video_duration_seconds <= 60"));
assert.ok(!sixty.includes("DELETE FROM"));
assert.ok(postAd.includes("up to 60 seconds and 15 MB"));
assert.ok(details.includes('id="galleryShare"'));
assert.ok(details.includes("shareCurrentListing"));

const product = fs.readFileSync(path.join(root, "product.html"), "utf8");
assert.ok(product.includes('listing_surface === "advertising"'));

(async function () {
  const copied = [];
  const shared = await market.shareListing(
    "https://havkar-app.vercel.app",
    listingId,
    {
      clipboard: {
        writeText: async function (value) {
          copied.push(value);
        }
      }
    }
  );
  assert.strictEqual(shared.method, "copy");
  assert.deepStrictEqual(copied, [
    "https://havkar-app.vercel.app/ad-details.html?id=" + listingId
  ]);

  let cancelled = false;
  const cancel = await market.shareListing(
    "https://havkar-app.vercel.app",
    listingId,
    {
      share: async function () {
        const error = new Error("closed");
        error.name = "AbortError";
        throw error;
      }
    }
  );
  assert.strictEqual(cancel.method, "cancel");
  cancelled = true;
  assert.strictEqual(cancelled, true);
  console.log("MARKETPLACE_ISOLATION_TEST_OK");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
