/**
 * Owner marketplace EUR1 Connect prepare helpers.
 * No live Stripe charges.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  MARKETPLACE_LIST_EUR,
  MARKETPLACE_BUYER_USER_ID,
  OWNER_USER_ID,
  CONFIRM_PHRASE,
  isOwnerEur1Request,
  createOwnerMarketplaceEur1CheckoutSession
} = require("../lib/owner-eur1-checkout.cjs");
const { marketplaceCardSplit } = require("../lib/marketplace-connect.cjs");

assert.equal(MARKETPLACE_LIST_EUR, 1);
assert.notEqual(MARKETPLACE_BUYER_USER_ID, OWNER_USER_ID);
assert.equal(CONFIRM_PHRASE, "PREPARE_EUR_1_00_LIVE_CHECKOUT");
assert.equal(
  isOwnerEur1Request({
    body: { action: "owner_marketplace_eur1_prepare" },
    url: "/api/owner-eur1-checkout"
  }),
  true
);

const split = marketplaceCardSplit(1);
assert.equal(split.buyer_pays_eur, 1.02);
assert.equal(split.seller_receives_eur, 0.97);
assert.equal(split.platform_commission_eur, 0.05);
assert.equal(split.buyer_pays_cents, 102);
assert.equal(split.application_fee_cents, 5);

let created = null;
const stripe = {
  checkout: {
    sessions: {
      async create(params, opts) {
        created = { params, opts };
        return {
          id: "cs_test_mkt_eur1",
          url: "https://checkout.stripe.com/c/pay/cs_test_mkt_eur1",
          expires_at: 123,
          livemode: false
        };
      }
    }
  }
};

const prepared = await createOwnerMarketplaceEur1CheckoutSession(
  stripe,
  "https://havkar.online",
  {
    listingId: 95,
    listingTitle: "probe",
    sellerUserId: OWNER_USER_ID,
    connectedAccountId: "acct_1UeCtbEASAxGUTvG"
  }
);
assert.equal(prepared.session.id, "cs_test_mkt_eur1");
assert.equal(created.params.payment_intent_data.application_fee_amount, 5);
assert.equal(
  created.params.payment_intent_data.transfer_data.destination,
  "acct_1UeCtbEASAxGUTvG"
);
assert.equal(created.params.line_items[0].price_data.unit_amount, 102);
assert.equal(created.params.metadata.havkar_flow, "marketplace");
assert.equal(created.params.metadata.owner_approved_eur1, "true");
assert.equal(created.params.metadata.listing_id, "95");

await assert.rejects(
  () =>
    createOwnerMarketplaceEur1CheckoutSession(stripe, "https://havkar.online", {
      listingId: 95,
      sellerUserId: MARKETPLACE_BUYER_USER_ID,
      connectedAccountId: "acct_1UeCtbEASAxGUTvG",
      buyerUserId: MARKETPLACE_BUYER_USER_ID
    }),
  /independent/
);

const api = fs.readFileSync(
  new URL("../api/create-event-checkout.js", import.meta.url),
  "utf8"
);
assert.match(api, /owner_marketplace_eur1_prepare/);
assert.match(api, /estimated_stripe_eu_card_fee_eur/);

const page = fs.readFileSync(
  new URL("../owner-eur1-checkout.html", import.meta.url),
  "utf8"
);
assert.match(page, /Prepare marketplace/);
assert.match(page, /owner_marketplace_eur1_prepare/);

console.log("OWNER_MARKETPLACE_EUR1_TEST_OK");
