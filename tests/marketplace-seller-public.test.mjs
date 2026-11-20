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

test("7 EUR marketplace split matches Owner fee arithmetic", () => {
  const split = marketplaceCardSplit(7);
  assert.equal(split.buyer_pays_eur, 7.14);
  assert.equal(split.seller_receives_eur, 6.79);
  assert.equal(split.platform_commission_eur, 0.35);
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
  assert.doesNotMatch(json, /secret@example\.com/);
  assert.doesNotMatch(json, /\+390000/);
  assert.doesNotMatch(json, /"email"/);
  assert.doesNotMatch(json, /"phone"/);
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
});
