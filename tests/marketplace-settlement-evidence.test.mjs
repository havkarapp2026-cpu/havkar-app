/**
 * Evidence tests: marketplace commission math, Connect destination params,
 * webhook refund/dispute/settlement, XLM direct_split refund refusal.
 * No live Stripe/XLM charges. No invented secrets.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  marketplaceCardSplit,
  buildMarketplaceDestinationCheckoutParams
} = require("../lib/marketplace-connect.cjs");
const { quoteListingFees } = require("../lib/stellar-checkout.cjs");
const {
  applyMarketplaceChargeSettlement,
  processStripeEvent,
  REQUIRED_WEBHOOK_EVENTS
} = require("../lib/stripe-webhook-processor.cjs");
const { BUYER_FEE_RATE, SELLER_FEE_RATE } = require("../lib/havkar-fee-examples.cjs");

const evidence = {
  commission: null,
  destination_checkout: null,
  refund: null,
  dispute_opened: null,
  dispute_lost: null,
  connect_account_updated: null,
  xlm_refund_policy: null,
  required_webhook_events: REQUIRED_WEBHOOK_EVENTS.slice()
};

// --- Commission: €100 list → buyer 102 / seller 97 / platform 5 ---
assert.equal(BUYER_FEE_RATE, 0.02);
assert.equal(SELLER_FEE_RATE, 0.03);
const card = marketplaceCardSplit(100);
assert.equal(card.list_price_eur, 100);
assert.equal(card.buyer_pays_eur, 102);
assert.equal(card.seller_receives_eur, 97);
assert.equal(card.platform_commission_eur, 5);
assert.equal(card.application_fee_cents, 500);
assert.equal(card.buyer_pays_cents, 10200);
const xlm = quoteListingFees(100);
assert.equal(xlm.buyerPays, 102);
assert.equal(xlm.sellerReceives, 97);
assert.equal(xlm.buyerFee + xlm.sellerFee, 5);
evidence.commission = {
  list_eur: 100,
  buyer_pays_eur: card.buyer_pays_eur,
  seller_receives_eur: card.seller_receives_eur,
  platform_commission_eur: card.platform_commission_eur,
  card_matches_xlm: true
};

// --- Destination Checkout params retain application_fee for HAVKAR ---
const checkout = buildMarketplaceDestinationCheckoutParams({
  split: card,
  connectedAccountId: "acct_TEST_PLACEHOLDER",
  listingTitle: "Evidence listing",
  successUrl: "https://havkar.online/buy-sell.html?payment=success",
  cancelUrl: "https://havkar.online/buy-sell.html?payment=cancelled",
  metadata: { havkar_flow: "marketplace", listing_id: "99" },
  customerEmail: "buyer@example.com"
});
assert.equal(checkout.payment_intent_data.application_fee_amount, 500);
assert.equal(
  checkout.payment_intent_data.transfer_data.destination,
  "acct_TEST_PLACEHOLDER"
);
assert.equal(checkout.line_items[0].price_data.unit_amount, 10200);
evidence.destination_checkout = {
  application_fee_amount: checkout.payment_intent_data.application_fee_amount,
  destination: checkout.payment_intent_data.transfer_data.destination,
  buyer_unit_amount: checkout.line_items[0].price_data.unit_amount
};

const settleCalls = [];
const store = {
  async settleMarketplaceCharge(row) {
    settleCalls.push(row);
    return { applied: true, status_changed: true, outcome: row.outcome };
  }
};

// --- Refund webhook → refunded, no silent relist ---
const refund = await applyMarketplaceChargeSettlement(
  store,
  {
    type: "charge.refunded",
    data: {
      object: {
        id: "ch_evidence_refund",
        amount: 10200,
        currency: "eur",
        metadata: { havkar_flow: "marketplace", listing_id: "40" }
      }
    }
  },
  null,
  "2026-11-21T08:00:00Z"
);
assert.equal(refund.applied, true);
assert.equal(refund.listing_id, 40);
assert.equal(settleCalls[0].nextStatus, "refunded");
assert.equal(settleCalls[0].outcome, "marketplace_card_refunded");
assert.notEqual(settleCalls[0].nextStatus, "active");
evidence.refund = {
  applied: true,
  listing_id: 40,
  nextStatus: "refunded",
  silent_relist: false
};

// --- Dispute opened ---
const disputeOpen = await applyMarketplaceChargeSettlement(
  store,
  {
    type: "charge.dispute.created",
    data: {
      object: {
        id: "dp_evidence_open",
        amount: 10200,
        currency: "eur",
        metadata: { havkar_flow: "marketplace", listing_id: "41" }
      }
    }
  },
  null,
  "2026-11-21T08:01:00Z"
);
assert.equal(disputeOpen.applied, true);
assert.equal(settleCalls[1].nextStatus, "disputed");
assert.equal(settleCalls[1].outcome, "marketplace_card_dispute_opened");
evidence.dispute_opened = {
  nextStatus: "disputed",
  outcome: "marketplace_card_dispute_opened"
};

// --- Dispute lost (closed with lost status) ---
const disputeLost = await applyMarketplaceChargeSettlement(
  store,
  {
    type: "charge.dispute.closed",
    data: {
      object: {
        id: "dp_evidence_lost",
        amount: 10200,
        currency: "eur",
        status: "lost",
        metadata: { havkar_flow: "marketplace", listing_id: "42" }
      }
    }
  },
  null,
  "2026-11-21T08:02:00Z"
);
assert.equal(disputeLost.applied, true);
assert.equal(settleCalls[2].outcome, "marketplace_card_dispute_lost");
evidence.dispute_lost = {
  outcome: settleCalls[2].outcome,
  nextStatus: settleCalls[2].nextStatus
};

// --- Connect account.updated via processStripeEvent ---
const connectUpdates = [];
const events = [];
const fullStore = {
  async insertEvent(row) {
    if (events.includes(row.stripe_event_id)) return { duplicate: true };
    events.push(row.stripe_event_id);
    return { duplicate: false };
  },
  async settleMarketplaceCharge() {
    return { applied: false };
  },
  async updateConnectAccount(row) {
    connectUpdates.push(row);
    return { updated: true };
  },
  async postFinanceJournal() {
    return { ok: true, skipped: true };
  }
};
const acctEvt = await processStripeEvent(
  {
    id: "evt_acct_evidence",
    type: "account.updated",
    livemode: false,
    data: {
      object: {
        id: "acct_TEST_PLACEHOLDER",
        charges_enabled: true,
        payouts_enabled: false,
        details_submitted: true
      }
    }
  },
  fullStore
);
assert.equal(acctEvt.applied, true);
assert.equal(connectUpdates[0].stripe_account_id, "acct_TEST_PLACEHOLDER");
assert.equal(connectUpdates[0].charges_enabled, true);
evidence.connect_account_updated = {
  applied: true,
  charges_enabled: true,
  payouts_enabled: false
};

assert.ok(REQUIRED_WEBHOOK_EVENTS.includes("charge.refunded"));
assert.ok(REQUIRED_WEBHOOK_EVENTS.includes("charge.dispute.created"));
assert.ok(REQUIRED_WEBHOOK_EVENTS.includes("account.updated"));

// --- XLM: direct_split refund refused in source (no silent platform refund) ---
const stellarSrc = fs.readFileSync("lib/stellar-checkout.cjs", "utf8");
assert.match(stellarSrc, /REFUND_MODEL_UNSUPPORTED/);
assert.match(stellarSrc, /Direct-split refunds must be initiated by the merchant/);
assert.match(stellarSrc, /platform_collect.*disabled|Platform-collect Stellar settlement is disabled/i);
evidence.xlm_refund_policy = {
  direct_split_server_refund: "unsupported",
  platform_collect_customer: "disabled",
  note: "Merchant must send XLM back; dual-leg auto-verify not enabled"
};

const terms = fs.readFileSync("terms.html", "utf8");
assert.match(terms, /marketplace-fees/);
assert.match(terms, /2%/);
assert.match(terms, /3%/);
assert.match(terms, /Still blank for counsel/);
assert.match(terms, /direct_split/);

const buysell = fs.readFileSync("buy-sell.html", "utf8");
assert.match(buysell, /sellerPayoutPanel/);
assert.match(buysell, /marketplace_connect_onboard/);
assert.match(buysell, /marketplace_connect_status/);

const outPath = "store/MARKETPLACE_SETTLEMENT_EVIDENCE_20261121.json";
fs.mkdirSync("store", { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2) + "\n");

console.log("MARKETPLACE_SETTLEMENT_EVIDENCE_OK");
console.log(JSON.stringify(evidence.commission));
console.log("evidence_file=" + outPath);
