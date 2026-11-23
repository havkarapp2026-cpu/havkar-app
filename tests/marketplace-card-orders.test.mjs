/**
 * marketplace_card_orders: build from Checkout session + webhook/API wiring.
 * No live Stripe charges.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildMarketplaceCardOrderFromSession
} = require("../lib/marketplace-card-orders.cjs");
const { fulfillMarketplaceCheckout } = require("../lib/stripe-webhook-processor.cjs");

const webhookSrc = fs.readFileSync(
  new URL("../api/stripe-webhook.js", import.meta.url),
  "utf8"
);
const apiSrc = fs.readFileSync(
  new URL("../api/create-event-checkout.js", import.meta.url),
  "utf8"
);
const buySellSrc = fs.readFileSync(
  new URL("../buy-sell.html", import.meta.url),
  "utf8"
);
const migrationSrc = fs.readFileSync(
  new URL(
    "../supabase/migrations/20261123060000_marketplace_card_orders.sql",
    import.meta.url
  ),
  "utf8"
);

assert.match(webhookSrc, /marketplace_card_orders/);
assert.match(webhookSrc, /upsertMarketplaceCardOrderBestEffort/);
assert.match(apiSrc, /list_marketplace_card_orders/);
assert.match(buySellSrc, /showOrdersHistory/);
assert.match(buySellSrc, /navOrders/);
assert.match(migrationSrc, /CREATE TABLE IF NOT EXISTS public\.marketplace_card_orders/);
assert.match(migrationSrc, /marketplace_card_orders_select_buyer/);

const built = buildMarketplaceCardOrderFromSession(
  {
    id: "cs_test_order_1",
    amount_total: 102,
    currency: "eur",
    payment_intent: {
      id: "pi_test_order_1",
      latest_charge: {
        id: "ch_test_order_1",
        application_fee: "fee_test_1",
        transfer: { id: "tr_test_1" }
      }
    },
    metadata: {
      havkar_flow: "marketplace",
      listing_id: "95",
      havkar_user_id: "d3869a63-a54e-48b5-baa1-4f253415298b",
      seller_id: "9b34b0bb-271a-49ee-aeb7-a9d28be06a06",
      list_price_eur: "1",
      platform_commission_eur: "0.05",
      connected_account_id: "acct_test_seller"
    }
  },
  { listingTitle: "HAVKAR EUR1 live marketplace probe" }
);

assert.equal(built.ok, true);
assert.equal(built.row.ad_id, 95);
assert.equal(built.row.buyer_pays, 1.02);
assert.equal(built.row.platform_fee, 0.05);
assert.equal(built.row.seller_receives, 0.97);
assert.equal(built.row.stripe_session_id, "cs_test_order_1");
assert.equal(built.row.stripe_payment_intent, "pi_test_order_1");
assert.equal(built.row.stripe_charge_id, "ch_test_order_1");
assert.equal(built.row.stripe_transfer_id, "tr_test_1");
assert.equal(built.row.stripe_application_fee_id, "fee_test_1");
assert.equal(built.row.status, "paid");

const missing = buildMarketplaceCardOrderFromSession({
  id: "cs_bad",
  metadata: { havkar_flow: "marketplace" }
});
assert.equal(missing.ok, false);

const captured = [];
const store = {
  async fulfillMarketplaceListing(payload) {
    captured.push(payload);
    return {
      applied: true,
      fulfillment: "marketplace_listing_ended",
      order_registered: true
    };
  }
};

const paid = await fulfillMarketplaceCheckout(
  store,
  {
    id: "cs_mkt_orders",
    payment_status: "paid",
    amount_total: 102,
    currency: "eur",
    metadata: {
      havkar_flow: "marketplace",
      listing_id: "95",
      havkar_user_id: "buyer-1",
      seller_id: "seller-1",
      list_price_eur: "1"
    }
  },
  "2026-11-23T04:22:47.315Z"
);
assert.equal(paid.applied, true);
assert.equal(captured.length, 1);
assert.equal(captured[0].sessionId, "cs_mkt_orders");
assert.ok(captured[0].session);

console.log("marketplace-card-orders.test.mjs: ok");
