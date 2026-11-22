import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const orch = require("../lib/havkar-payment-orchestration.cjs");

assert.equal(orch.PRESENTMENT_COUNT, 133);
assert.ok(orch.ALLOWED_XLM_FLOWS.includes("ai_credits"));
assert.ok(orch.ALLOWED_XLM_FLOWS.includes("jobs_listing"));

const matrix = orch.providerCapabilityMatrix();
assert.equal(matrix.ok, true);
assert.equal(matrix.stripe_presentment.count, 133);
assert.equal(matrix.stripe_presentment.xlm_settlement, false);
assert.equal(matrix.revolut_business.public_iban_exposure, false);
assert.equal(matrix.stellar_xlm.automatic_recurring, false);

const refused = orch.refuseLiveCheckout("stripe");
assert.equal(refused.ok, false);
assert.equal(refused.paid, undefined);
assert.match(String(refused.code || refused.error), /NOT_ARMED|not armed|Live checkout/i);

const badIdem = orch.validateIdempotencyKey("abc");
assert.equal(badIdem.ok, false);
const goodIdem = orch.validateIdempotencyKey("quote-ai-plus-001");
assert.equal(goodIdem.ok, true);

const noFulfill = orch.refuseUnauthorizedFulfillment();
assert.equal(noFulfill.fulfilled, false);
assert.equal(noFulfill.paid, false);

const xlmQuote = await orch.orchestrateQuote({
  method: "xlm",
  module: "ai_credits",
  price: 7.99,
  subject_id: "ai_credits_plus",
  idempotency_key: "orch-ai-credits-0001"
});
assert.equal(xlmQuote.ok, true);
assert.equal(xlmQuote.paid, false);
assert.equal(xlmQuote.fulfillment_separated, true);

const stripeQuote = await orch.orchestrateQuote({
  method: "stripe",
  module: "ai",
  currency: "usd",
  subject_id: "ai_credits_plus"
});
assert.equal(stripeQuote.ok, true);
assert.equal(stripeQuote.quote.settlement_currency || "EUR", "EUR");
assert.ok(stripeQuote.quote.fx_expires_at || stripeQuote.quote.fx_date);

console.log("HAVKAR_PAYMENT_ORCHESTRATION_TEST_OK");
