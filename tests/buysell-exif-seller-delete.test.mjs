import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const postAd = fs.readFileSync("post-ad.html", "utf8");
const details = fs.readFileSync("ad-details.html", "utf8");
const buySell = fs.readFileSync("buy-sell.html", "utf8");
const images = fs.readFileSync("havkar-ad-images.js", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20261120120000_delete_own_marketplace_listing.sql",
  "utf8"
);
const sellerMigration = fs.readFileSync(
  "supabase/migrations/20261120140000_marketplace_seller_public_rpc.sql",
  "utf8"
);
const api = fs.readFileSync("api/create-event-checkout.js", "utf8");

test("post-ad compressImage uses EXIF-aware createImageBitmap orientation", () => {
  assert.match(postAd, /createImageBitmap/);
  assert.match(postAd, /imageOrientation:\s*["']from-image["']/);
});

test("listing galleries request from-image orientation", () => {
  assert.match(details, /image-orientation:\s*from-image/);
  assert.match(buySell, /image-orientation:\s*from-image/);
});

test("own listings still load public seller profile fields", () => {
  assert.match(details, /Your public seller profile/);
  assert.match(details, /fetchSellerPublicProfile/);
  assert.match(details, /get_marketplace_seller_public/);
  assert.match(details, /sellerFromAuthUser/);
  assert.match(details, /Public name not set/);
  assert.match(details, /missing_reason/);
  assert.match(buySell, /get_marketplace_sellers_public/);
  assert.match(buySell, /ad-seller-row/);
  assert.match(buySell, /Public name not set/);
  assert.match(sellerMigration, /get_marketplace_seller_public/);
  assert.match(sellerMigration, /_havkar_sanitize_public_display_name/);
});

test("owner delete uses server RPC and own-folder image cleanup", () => {
  assert.match(details, /delete_own_marketplace_listing/);
  assert.match(details, /deleteOwnAdvertisementImages/);
  assert.match(details, /Delete did not complete/);
  assert.match(buySell, /own-delete-button/);
  assert.match(buySell, /confirmAndDeleteOwnListing/);
  assert.match(buySell, /Paused · not public/);
  assert.match(buySell, /Server still returns this listing/);
  assert.match(images, /deleteOwnAdvertisementImages/);
  assert.match(migration, /delete_own_marketplace_listing/);
  assert.match(migration, /ad_images_delete_own_directory/);
  assert.match(migration, /user_id = v_uid/);
  const hardened = fs.readFileSync(
    "supabase/migrations/20261120210000_delete_own_listing_clears_saves.sql",
    "utf8"
  );
  assert.match(hardened, /GET DIAGNOSTICS v_saves_deleted/);
  assert.match(hardened, /'cleared'/);
  const adView = fs.readFileSync("ad-view.html", "utf8");
  assert.match(adView, /delete_own_marketplace_listing/);
  assert.doesNotMatch(
    adView,
    /from\("ads"\)\.delete\(\)\.eq\("id", ad\.id\)/
  );
});

test("draft seller public API is owner-gated", () => {
  assert.match(api, /Draft\/paused: only the owner/);
  assert.match(api, /authenticateUser\(req\)/);
});
