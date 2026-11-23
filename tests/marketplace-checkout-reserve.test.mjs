/**
 * Marketplace Buy Now: active gate, reserved anti-double-sell, expire release,
 * fulfill from reserved|active → ended. No live Stripe charges.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  processStripeEvent,
  releaseMarketplaceCheckoutReservation,
  fulfillMarketplaceCheckout
} = require("../lib/stripe-webhook-processor.cjs");
const { marketplaceCardSplit } = require("../lib/marketplace-connect.cjs");

const checkoutSrc = fs.readFileSync(
  new URL("../api/create-event-checkout.js", import.meta.url),
  "utf8"
);
const webhookSrc = fs.readFileSync(
  new URL("../api/stripe-webhook.js", import.meta.url),
  "utf8"
);
const migrationSrc = fs.readFileSync(
  new URL(
    "../supabase/migrations/20261123040000_marketplace_listing_status_checkout.sql",
    import.meta.url
  ),
  "utf8"
);

assert.match(checkoutSrc, /listingStatus !== "active"/);
assert.match(checkoutSrc, /LISTING_RESERVED/);
assert.match(checkoutSrc, /status: "reserved"/);
assert.match(checkoutSrc, /buyer_fee_pct: 0\.02/);
assert.match(checkoutSrc, /seller_fee_pct: 0\.03/);
assert.match(checkoutSrc, /platform_fee_pct_total: 0\.05/);
assert.match(webhookSrc, /\.in\("status", \["active", "reserved"\]\)/);
assert.match(webhookSrc, /releaseMarketplaceReservation/);
assert.match(migrationSrc, /'reserved'/);
assert.match(migrationSrc, /'refunded'/);
assert.match(migrationSrc, /'disputed'/);

const split = marketplaceCardSplit(100);
assert.equal(split.platform_commission_eur, 5);
assert.equal(split.buyer_fee_eur, 2);
assert.equal(split.seller_fee_eur, 3);

const listings = new Map();
listings.set(77, { id: 77, status: "reserved", listing_surface: "marketplace" });

const store = {
  async fulfillMarketplaceListing({ listingId }) {
    const row = listings.get(listingId);
    if (!row) return { applied: false, reason: "listing_not_found" };
    if (row.status === "ended") {
      return { applied: false, duplicate: true, reason: "already_ended" };
    }
    if (row.status !== "active" && row.status !== "reserved") {
      return { applied: false, reason: "listing_not_purchasable", status: row.status };
    }
    row.status = "ended";
    return {
      applied: true,
      fulfillment: "marketplace_listing_ended",
      previous_status: "reserved"
    };
  },
  async releaseMarketplaceReservation({ listingId }) {
    const row = listings.get(listingId);
    if (!row) return { applied: false, reason: "listing_not_found" };
    if (row.status !== "reserved") {
      return { applied: false, reason: "listing_not_reserved", status: row.status };
    }
    row.status = "active";
    return { applied: true, fulfillment: "marketplace_reservation_released" };
  }
};

const expired = await processStripeEvent(
  {
    id: "evt_mkt_expire",
    type: "checkout.session.expired",
    livemode: true,
    data: {
      object: {
        id: "cs_mkt_expire",
        metadata: { havkar_flow: "marketplace", listing_id: "77" }
      }
    }
  },
  store
);
assert.equal(expired.applied, true);
assert.equal(expired.kind, "marketplace_release");
assert.equal(listings.get(77).status, "active");

listings.set(77, { id: 77, status: "reserved", listing_surface: "marketplace" });
const paid = await fulfillMarketplaceCheckout(
  store,
  {
    id: "cs_mkt_paid2",
    payment_status: "paid",
    metadata: { havkar_flow: "marketplace", listing_id: "77" }
  },
  new Date().toISOString()
);
assert.equal(paid.applied, true);
assert.equal(listings.get(77).status, "ended");

const releaseDirect = await releaseMarketplaceCheckoutReservation(
  store,
  {
    id: "cs_noop",
    metadata: { havkar_flow: "marketplace", listing_id: "77" }
  },
  "manual"
);
assert.equal(releaseDirect.applied, false);
assert.equal(releaseDirect.reason, "listing_not_reserved");

console.log("MARKETPLACE_CHECKOUT_RESERVE_TEST_OK");
