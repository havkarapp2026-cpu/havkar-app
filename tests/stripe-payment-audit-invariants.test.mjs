import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fees = require("../lib/havkar-fee-examples.cjs");
const settlement = require("../lib/stripe-ticket-settlement.cjs");

assert.equal(fees.BUYER_FEE_RATE, 0.02);
assert.equal(fees.SELLER_FEE_RATE, 0.03);
assert.equal(fees.SERVICE_COMMISSION_RATE, 0.1);

const market = fees.marketplaceExample(100);
assert.equal(market.stripe_connect_used, false);
assert.match(market.notes, /NOT implemented/i);

const services = fees.serviceCommissionExample(100);
assert.equal(services.collection_state_in_code, "uncollected");
assert.equal(services.automatic_debit, false);

const ticket = fees.eventTicketExample(10);
assert.equal(ticket.connect, false);
assert.match(ticket.code_path, /stripe-webhook/);

const feeNotes = fees.platformCommissionOnlyExamples([1])[0];
assert.match(
  feeNotes.if_already_inside_platform_checkout_gross.bank,
  /REVOLUT PAYMENTS UAB last4 8455/
);

assert.equal(settlement.settlementActionForEvent("charge.refunded").kind, "refund");
assert.equal(settlement.settlementActionForEvent("charge.dispute.updated").kind, "dispute_updated");
assert.equal(settlement.settlementActionForEvent("payout.created").kind, "payout");

const webhook = fs.readFileSync("api/stripe-webhook.js", "utf8");
assert.match(webhook, /constructEvent/);
assert.match(webhook, /bodyParser:\s*false/);
assert.match(webhook, /claimStripeWebhookEvent/);
assert.match(webhook, /isOwnerEur1Session/);
assert.match(webhook, /Signed webhook delivery must still verify and settle/);
assert.doesNotMatch(webhook, /sk_live_[A-Za-z0-9]+/);
assert.match(
  fs.readFileSync("lib/stripe-webhook-idempotency.cjs", "utf8"),
  /owner_micro_test/
);

const marketplaceJs = fs.readFileSync("havkar-marketplace.js", "utf8");
assert.match(marketplaceJs, /SELLER_FEE_RATE = 0\.03/);
assert.doesNotMatch(marketplaceJs, /checkout\.sessions\.create/);

const buySell = fs.readFileSync("buy-sell.html", "utf8");
assert.doesNotMatch(buySell, /\/api\/create-event-checkout/);

console.log("STRIPE_PAYMENT_AUDIT_INVARIANTS_OK");
