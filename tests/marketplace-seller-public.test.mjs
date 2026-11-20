import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  sanitizeDisplayName,
  pickPublicDisplayName,
  pickPublicAvatarUrl,
  buildMarketplaceSellerPublicPayload
} = require("../lib/marketplace-seller-public.cjs");
const { marketplaceCardSplit } = require("../lib/marketplace-connect.cjs");

const html = fs.readFileSync("ad-details.html", "utf8");
const api = fs.readFileSync("api/create-event-checkout.js", "utf8");
const buySell = fs.readFileSync("buy-sell.html", "utf8");

test("7 EUR marketplace split matches Owner fee arithmetic", () => {
  const split = marketplaceCardSplit(7);
  assert.equal(split.buyer_pays_eur, 7.14);
  assert.equal(split.seller_receives_eur, 6.79);
  assert.equal(split.platform_commission_eur, 0.35);
});

test("1 EUR marketplace split is buyer 1.02 / seller 0.97 / platform 0.05", () => {
  const split = marketplaceCardSplit(1);
  assert.equal(split.buyer_pays_eur, 1.02);
  assert.equal(split.seller_receives_eur, 0.97);
  assert.equal(split.platform_commission_eur, 0.05);
  assert.equal(split.buyer_pays_cents, 102);
  assert.equal(split.application_fee_cents, 5);
});

test("public seller payload never includes email or phone", () => {
  const payload = buildMarketplaceSellerPublicPayload({
    listingId: 30,
    sellerUserId: "ad052523-8831-45e2-9673-55373dbea311",
    profile: { full_name: null, avatar_url: null, phone: "hidden" },
    authUser: {
      created_at: "2026-10-22T08:15:30.391Z",
      user_metadata: {
        full_name: "Sorsn2024sss",
        name: "Sorsn2024sss",
        avatar_url:
          "https://lh3.googleusercontent.com/a/example=s96-c",
        email: "secret@example.com",
        phone: "+390000"
      }
    }
  });
  const json = JSON.stringify(payload);
  assert.equal(payload.seller.display_name, "Sorsn2024sss");
  assert.match(payload.seller.avatar_url, /^https:\/\//);
  assert.equal(payload.seller.has_public_profile, true);
  assert.equal(payload.fallback_label, null);
  assert.equal(payload.missing_reason, null);
  assert.doesNotMatch(json, /secret@example\.com/);
  assert.doesNotMatch(json, /\+390000/);
  assert.doesNotMatch(json, /"email"/);
  assert.doesNotMatch(json, /"phone"/);
});

test("missing public profile reports reason instead of fake name", () => {
  const payload = buildMarketplaceSellerPublicPayload({
    listingId: 46,
    sellerUserId: "11845ff0-9f33-4869-95fa-a32bd2dd2d5e",
    profile: { full_name: null, avatar_url: null },
    authUser: { user_metadata: {} }
  });
  assert.equal(payload.seller.display_name, null);
  assert.equal(payload.seller.avatar_url, null);
  assert.equal(payload.seller.has_public_profile, false);
  assert.equal(payload.fallback_label, null);
  assert.match(payload.missing_reason, /not set a public display name/i);
});

test("email-shaped names are rejected as public display names", () => {
  assert.equal(sanitizeDisplayName("user@example.com"), null);
  assert.equal(
    pickPublicDisplayName(
      { full_name: "user@example.com" },
      { name: "user@example.com" }
    ),
    null
  );
});

test("avatar must be https", () => {
  assert.equal(
    pickPublicAvatarUrl(
      { avatar_url: "http://insecure.example/a.png" },
      { picture: "https://cdn.example/a.png" }
    ),
    "https://cdn.example/a.png"
  );
});

test("API exposes marketplace_seller_public and marketplace public live gate", () => {
  assert.match(api, /marketplace_seller_public/);
  assert.match(api, /HAVKAR_MARKETPLACE_PUBLIC_LIVE_PAYMENTS/);
  assert.match(api, /MARKETPLACE_PUBLIC_LIVE_OFF/);
  assert.match(api, /customer_message/);
});

test("checkout API exposes public seller GET without a new serverless file", () => {
  assert.match(api, /marketplaceConnectAction/);
  assert.match(api, /marketplace_seller_public/);
  assert.match(api, /req\.query && req\.query\.action/);
  assert.equal(fs.existsSync("api/marketplace_seller_public.js"), false);
});

test("ad-details seller identity is notranslate and multi-path", () => {
  assert.match(html, /id="sellerName"/);
  assert.match(html, /class="seller-name notranslate"/);
  assert.match(
    html,
    /action=marketplace_seller_public&listing_id=/
  );
  assert.match(html, /get_marketplace_seller_public/);
  assert.match(html, /havkar:i18n-ready/);
  assert.doesNotMatch(html, /HAVKAR Member/);
  assert.match(buySell, /ad-seller-name notranslate/);
});

test("ad-details uses safe buy status UI without raw JSON dumps", () => {
  assert.match(html, /id="buyStatus"/);
  assert.doesNotMatch(html, /id="buyReceipt"/);
  assert.match(html, /marketplace_seller_public/);
  assert.match(html, /setBuyStatus/);
  assert.match(html, /marketplaceCheckoutCustomerMessage/);
  assert.doesNotMatch(
    html,
    /buyReceipt[\s\S]{0,200}JSON\.stringify/
  );
  assert.match(html, /position:static/);
  assert.match(
    html,
    /Card checkout unavailable \(Owner authorization required\)/
  );
  assert.match(html, /id="sellerConnectButton"/);
  assert.match(html, /startSellerConnectOnboard/);
});
