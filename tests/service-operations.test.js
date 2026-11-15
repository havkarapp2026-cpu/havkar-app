"use strict";

const assert = require("assert");
const ops = require("../havkar-service-operations.js");

(function run() {
  const invoice = ops.invoiceFromBooking({
    id: 12,
    customer_id: "c1",
    provider_id: "p1",
    agreed_price: 100,
    currency: "eur",
    payment_method: "stripe"
  });
  assert.strictEqual(invoice.ok, true);
  assert.strictEqual(invoice.invoice.provider_commission_bps, 1000);
  assert.strictEqual(invoice.invoice.provider_commission_cents, 1000);
  assert.strictEqual(invoice.invoice.provider_settlement_cents, 9000);
  assert.strictEqual(invoice.invoice.customer_total_cents, 10000);

  const milestone = ops.validateMilestone({ title: "Phase 1", amount: 40 });
  assert.strictEqual(milestone.ok, true);

  const slot = ops.validateAvailabilitySlot({
    slot_date: "2026-12-01",
    start_time: "09:00",
    end_time: "12:00"
  });
  assert.strictEqual(slot.ok, true);

  const review = ops.validateReview({ rating: 5, review_text: "Great work done." });
  assert.strictEqual(review.ok, true);

  const dispute = ops.validateDispute({
    category: "refund_request",
    details: "Service incomplete and I request a refund path."
  });
  assert.strictEqual(dispute.ok, true);

  assert.strictEqual(ops.validateDispute({ category: "hack", details: "too short" }).ok, false);
  assert.strictEqual(ops.COMMISSION_BPS, 1000);

  console.log("SERVICE_OPERATIONS_TEST_OK");
})();
