import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  marketplaceExample,
  serviceCommissionExample,
  platformCommissionOnlyExamples,
  eventTicketExample,
  BUYER_FEE_RATE,
  SELLER_FEE_RATE,
  SERVICE_COMMISSION_RATE
} = require("../lib/havkar-fee-examples.cjs");

test("marketplace fee rules are 2% buyer and 3% seller", () => {
  assert.equal(BUYER_FEE_RATE, 0.02);
  assert.equal(SELLER_FEE_RATE, 0.03);
  const ex = marketplaceExample(100);
  assert.equal(ex.buyer_fee_eur, 2);
  assert.equal(ex.seller_fee_eur, 3);
  assert.equal(ex.buyer_pays_eur, 102);
  assert.equal(ex.seller_receives_eur, 97);
  assert.equal(ex.platform_commission_eur, 5);
  assert.equal(ex.stripe_connect_used, true);
});

test("service commission is 10% liability only", () => {
  assert.equal(SERVICE_COMMISSION_RATE, 0.1);
  const ex = serviceCommissionExample(100);
  assert.equal(ex.commission_eur, 10);
  assert.equal(ex.provider_settlement_eur, 90);
  assert.equal(ex.automatic_debit, false);
  assert.equal(ex.collection_state_in_code, "uncollected");
});

test("tiny standalone commissions vs fee estimate", () => {
  const rows = platformCommissionOnlyExamples([0.1, 0.5, 1, 10, 100]);
  // €0.10 cannot cover the estimated €0.25 fixed Stripe fee.
  assert.equal(rows[0].if_collected_as_standalone_charge_of_same_amount.economically_viable_estimate, false);
  // €0.50 is barely positive under 1.5% + €0.25 estimate (estimate only).
  assert.equal(rows[1].if_collected_as_standalone_charge_of_same_amount.economically_viable_estimate, true);
  assert.equal(rows[2].if_collected_as_standalone_charge_of_same_amount.economically_viable_estimate, true);
  assert.equal(rows[3].if_collected_as_standalone_charge_of_same_amount.economically_viable_estimate, true);
  assert.equal(rows[4].if_collected_as_standalone_charge_of_same_amount.economically_viable_estimate, true);
});

test("event ticket path is direct platform Checkout without Connect", () => {
  const ex = eventTicketExample(20);
  assert.equal(ex.connect, false);
  assert.equal(ex.application_fee, null);
  assert.equal(ex.buyer_pays_eur, 20);
  assert.match(ex.code_path, /create-event-checkout/);
});
