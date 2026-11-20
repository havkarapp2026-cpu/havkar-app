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
  const sellerFn = details.match(
    /async function updateSellerUI\(\)\{[\s\S]*?\n\}/
  );
  assert.ok(sellerFn, "updateSellerUI present");
  assert.match(sellerFn[0], /fetchSellerPublicProfile/);
  assert.match(sellerFn[0], /applySellerPublicFields/);
  assert.doesNotMatch(
    sellerFn[0],
    /if\(state\.isOwnListing\)\{[\s\S]{0,180}updateOwnerTools\(\);\s*return;/
  );
});

test("owner delete uses server RPC and own-folder image cleanup", () => {
  assert.match(details, /delete_own_marketplace_listing/);
  assert.match(details, /deleteOwnAdvertisementImages/);
  assert.match(buySell, /own-delete-button/);
  assert.match(buySell, /confirmAndDeleteOwnListing/);
  assert.match(images, /deleteOwnAdvertisementImages/);
  assert.match(migration, /delete_own_marketplace_listing/);
  assert.match(migration, /ad_images_delete_own_directory/);
  assert.match(migration, /user_id = v_uid/);
});
