import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildMarketplacePublicReadiness,
  feeRules
} = require("../lib/marketplace-public-readiness.cjs");
const {
  marketplaceCardSplit
} = require("../lib/marketplace-connect.cjs");
const { quoteListingFees } = require("../lib/stellar-checkout.cjs");
const {
  applyMarketplaceChargeSettlement,
  processStripeEvent
} = require("../lib/stripe-webhook-processor.cjs");
const { BUYER_FEE_RATE, SELLER_FEE_RATE } = require("../lib/havkar-fee-examples.cjs");

assert.equal(BUYER_FEE_RATE, 0.02);
assert.equal(SELLER_FEE_RATE, 0.03);

const fees = feeRules();
assert.equal(fees.example_list_eur_100.buyer_pays_eur, 102);
assert.equal(fees.example_list_eur_100.seller_receives_eur, 97);
assert.equal(fees.example_list_eur_100.platform_commission_eur, 5);

const card = marketplaceCardSplit(100);
const xlm = quoteListingFees(100);
assert.equal(card.buyer_fee_eur, xlm.buyerFee);
assert.equal(card.seller_fee_eur, xlm.sellerFee);
assert.equal(card.buyer_pays_eur, xlm.buyerPays);
assert.equal(card.seller_receives_eur, xlm.sellerReceives);

const readinessOff = buildMarketplacePublicReadiness(
  {
    HAVKAR_REAL_PAYMENTS_ENABLED: "true",
    HAVKAR_STRIPE_LIVE_ENABLED: "true",
    HAVKAR_MARKETPLACE_PUBLIC_LIVE_PAYMENTS: "false"
  },
  { connect_sellers_ready: 0 }
);
assert.equal(readinessOff.ready_for_owner_live_activation, false);
assert.ok(
  readinessOff.blockers.some((b) => b.code === "MARKETPLACE_PUBLIC_LIVE_OFF")
);
assert.equal(readinessOff.real_charges_created_by_this_report, false);
assert.equal(readinessOff.secrets.STRIPE_SECRET_KEY_present, false);

const api = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(api, /idempotencyKey/);
assert.match(api, /marketplace_public_readiness/);
assert.match(api, /MARKETPLACE_PUBLIC_LIVE_OFF/);

const webhook = fs.readFileSync("api/stripe-webhook.js", "utf8");
assert.match(webhook, /settleMarketplaceCharge/);
assert.match(webhook, /marketplace_card_refunded|outcome/);

const calls = [];
const store = {
  async settleMarketplaceCharge(row) {
    calls.push(row);
    return { applied: true, status_changed: true };
  }
};
const refund = await applyMarketplaceChargeSettlement(
  store,
  {
    type: "charge.refunded",
    data: {
      object: {
        id: "ch_1",
        amount: 10200,
        currency: "eur",
        metadata: { havkar_flow: "marketplace", listing_id: "30" }
      }
    }
  },
  null,
  "2026-11-21T00:00:00Z"
);
assert.equal(refund.applied, true);
assert.equal(refund.listing_id, 30);
assert.equal(calls[0].nextStatus, "refunded");
assert.equal(calls[0].outcome, "marketplace_card_refunded");

const events = [];
const fullStore = {
  async insertEvent(row) {
    if (events.includes(row.stripe_event_id)) return { duplicate: true };
    events.push(row.stripe_event_id);
    return { duplicate: false };
  },
  async settleMarketplaceCharge(row) {
    return { applied: true, status_changed: true, outcome: row.outcome };
  },
  async postFinanceJournal() {
    return { ok: true, skipped: true };
  }
};
const dispute = await processStripeEvent(
  {
    id: "evt_dispute_1",
    type: "charge.dispute.created",
    livemode: true,
    data: {
      object: {
        id: "dp_1",
        amount: 10200,
        currency: "eur",
        metadata: { havkar_flow: "marketplace", listing_id: "31" },
        payment_intent: null
      }
    }
  },
  fullStore
);
assert.equal(dispute.applied, true);
assert.equal(dispute.kind, "marketplace_settlement");

console.log("MARKETPLACE_PUBLIC_READY_TEST_OK");
