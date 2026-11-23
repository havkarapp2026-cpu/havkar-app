/**
 * Security + Connect payment gate tests for marketplace Buy Now.
 * No live money. Asserts fail-closed paths and fee math.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  marketplaceCardSplit,
  buildMarketplaceDestinationCheckoutParams
} = require("../lib/marketplace-connect.cjs");
const {
  processStripeEvent,
  REQUIRED_WEBHOOK_EVENTS
} = require("../lib/stripe-webhook-processor.cjs");

const checkoutSrc = fs.readFileSync(
  new URL("../api/create-event-checkout.js", import.meta.url),
  "utf8"
);
const webhookSrc = fs.readFileSync(
  new URL("../api/stripe-webhook.js", import.meta.url),
  "utf8"
);

/* Fee integrity: 2% + 3% = 5% destination application fee */
const split = marketplaceCardSplit(199.99);
assert.ok(split);
assert.equal(split.buyer_fee_eur, 4);
assert.equal(split.seller_fee_eur, 6);
assert.equal(split.platform_commission_eur, 10);
assert.equal(split.buyer_pays_cents, 20399);
assert.equal(split.application_fee_cents, 1000);

const params = buildMarketplaceDestinationCheckoutParams({
  split,
  connectedAccountId: "acct_1UeCtbEASAxGUTvG",
  listingTitle: "Security probe listing",
  successUrl: "https://havkar.online/ad-details.html?id=1&paid=1",
  cancelUrl: "https://havkar.online/ad-details.html?id=1&paid=0",
  metadata: { listing_id: "1", seller_id: "seller" },
  customerEmail: "buyer@example.com"
});
assert.equal(
  params.payment_intent_data.transfer_data.destination,
  "acct_1UeCtbEASAxGUTvG"
);
assert.equal(params.payment_intent_data.application_fee_amount, 1000);
assert.equal(params.metadata.havkar_flow, "marketplace");

/* Source gates: auth, self-buy, active-only, reserve, Connect required */
assert.match(checkoutSrc, /You cannot buy your own listing/);
assert.match(checkoutSrc, /listingStatus !== "active"/);
assert.match(checkoutSrc, /SELLER_CONNECT_REQUIRED/);
assert.match(checkoutSrc, /MARKETPLACE_PUBLIC_LIVE_OFF/);
assert.match(checkoutSrc, /status: "reserved"/);
assert.match(checkoutSrc, /buyer_fee_pct: 0\.02/);
assert.match(checkoutSrc, /seller_fee_pct: 0\.03/);

/* Webhook cannot invent silent relist after refund */
assert.match(webhookSrc, /releaseMarketplaceReservation/);
assert.match(webhookSrc, /\.in\("status", \["active", "reserved"\]\)/);
assert.ok(REQUIRED_WEBHOOK_EVENTS.includes("charge.refunded"));
assert.ok(REQUIRED_WEBHOOK_EVENTS.includes("charge.dispute.created"));
assert.ok(REQUIRED_WEBHOOK_EVENTS.includes("account.updated"));

/* Expired marketplace checkout restores reservation; does not mark paid */
const listings = new Map([
  [40, { id: 40, status: "reserved" }]
]);
const store = {
  async releaseMarketplaceReservation({ listingId }) {
    const row = listings.get(listingId);
    if (!row || row.status !== "reserved") {
      return { applied: false, reason: "listing_not_reserved" };
    }
    row.status = "active";
    return { applied: true, fulfillment: "marketplace_reservation_released" };
  },
  async fulfillMarketplaceListing() {
    throw new Error("must not fulfill on expire");
  }
};
const expired = await processStripeEvent(
  {
    id: "evt_sec_expire",
    type: "checkout.session.expired",
    livemode: true,
    data: {
      object: {
        id: "cs_sec_expire",
        metadata: { havkar_flow: "marketplace", listing_id: "40" }
      }
    }
  },
  store
);
assert.equal(expired.applied, true);
assert.equal(listings.get(40).status, "active");

/* Unpaid completed session must not end listing */
let fulfillCalls = 0;
const unpaidStore = {
  async fulfillMarketplaceListing() {
    fulfillCalls += 1;
    return { applied: true };
  }
};
const unpaid = await processStripeEvent(
  {
    id: "evt_sec_unpaid",
    type: "checkout.session.completed",
    livemode: true,
    data: {
      object: {
        id: "cs_sec_unpaid",
        payment_status: "unpaid",
        metadata: { havkar_flow: "marketplace", listing_id: "40" }
      }
    }
  },
  unpaidStore
);
assert.equal(unpaid.applied, false);
assert.equal(unpaid.reason, "payment_not_paid");
assert.equal(fulfillCalls, 0);

console.log("MARKETPLACE_CONNECT_SECURITY_TEST_OK");
