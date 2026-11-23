import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import {
  ARCHITECTURE,
  mapMarketplaceOrder,
  mapServiceBooking,
  moneyFromNumber,
  centsToMoney
} from "../lib/havkar-wallet-commerce.cjs";

const require = createRequire(import.meta.url);

assert.equal(ARCHITECTURE.marketplace_fees.buyer_bps, 200);
assert.equal(ARCHITECTURE.marketplace_fees.seller_bps, 300);
assert.equal(ARCHITECTURE.services_fees.provider_commission_bps, 1000);
assert.match(ARCHITECTURE.custody, /does not hold customer fiat/i);

assert.equal(moneyFromNumber("1.02"), 1.02);
assert.equal(centsToMoney(90), 0.9);

const order = mapMarketplaceOrder(
  {
    id: "65e9b522-9f60-406e-8c30-5fc3cfd8107e",
    ad_id: 95,
    listing_title: "HAVKAR EUR1 live marketplace probe",
    list_price_eur: "1.00",
    buyer_pays: "1.02",
    seller_receives: "0.97",
    platform_fee: "0.05",
    currency: "eur",
    status: "paid",
    stripe_payment_intent: "pi_3Ueom2ECWiUpELSP1GXvevLy",
    stripe_transfer_id: "tr_3Ueom2ECWiUpELSP1hzTMISD",
    paid_at: "2026-11-23T04:22:47.315Z"
  },
  "seller"
);
assert.equal(order.ad_id, 95);
assert.equal(order.buyer_pays, 1.02);
assert.equal(order.seller_receives, 0.97);
assert.equal(order.platform_fee, 0.05);
assert.equal(order.role, "seller");

const booking = mapServiceBooking(
  {
    id: 3,
    service_id: 12,
    status: "accepted",
    currency: "EUR",
    agreed_price: "1.00",
    commission_bps: 1000,
    commission_amount: "0.10",
    stripe_payment_intent: "pi_3UepmzECWiUpELSP106fev3g"
  },
  {
    commission_cents: 10,
    provider_settlement_cents: 90,
    collection_state: "collected_stripe",
    settlement_channel: "online"
  },
  "provider"
);
assert.equal(booking.id, 3);
assert.equal(booking.commission_amount, 0.1);
assert.equal(booking.provider_settlement, 0.9);
assert.equal(booking.collection_state, "collected_stripe");

const financeApi = fs.readFileSync("lib/havkar-finance-api.cjs", "utf8");
assert.match(financeApi, /wallet_activity/);
assert.match(financeApi, /buildWalletActivity/);

const walletPage = fs.readFileSync("wallet.html", "utf8");
assert.match(walletPage, /commerce-panel/);
assert.match(walletPage, /loadCommerceActivity/);
assert.match(walletPage, /Internal accounting ledger/);
assert.match(walletPage, /action=wallet_activity/);
assert.doesNotMatch(walletPage, /Live payments paused until Owner enables collection/);

const flags = require("../havkar-wallet.js");
assert.equal(flags.FIAT_DEPOSITS_ENABLED, false);
assert.equal(flags.FIAT_WITHDRAWALS_ENABLED, false);
assert.equal(flags.FIAT_TRANSFERS_ENABLED, false);

console.log("HAVKAR_WALLET_COMMERCE_TEST_OK");
