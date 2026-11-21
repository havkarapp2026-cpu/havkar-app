import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  marketplaceCardSplit
} = require("../lib/marketplace-connect.cjs");
const {
  CONFIRM_PHRASE
} = require("../lib/stripe-sandbox-connect-e2e.cjs");

test("connect e2e confirm phrase matches sandbox payment e2e", () => {
  assert.equal(CONFIRM_PHRASE, "sandbox_payout_paid_e2e");
});

test("connect destination fee example remains 2% buyer + 3% seller", () => {
  const split = marketplaceCardSplit(100);
  assert.equal(split.buyer_pays_cents, 10200);
  assert.equal(split.application_fee_cents, 500);
  assert.equal(split.charge_pattern, "destination");
});
