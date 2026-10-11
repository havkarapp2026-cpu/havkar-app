"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const commerce = require("../havkar-service-commerce.js");
const services = require("../havkar-services.js");

assert.strictEqual(commerce.commissionPolicy({}).ok, false);
assert.strictEqual(commerce.commissionPolicy({ HAVKAR_SERVICE_COMMISSION_BPS: "1000" }).bps, 1000);
assert.strictEqual(commerce.commissionSplit(10000, { ok: false }).reason, "commission_not_configured");
const split = commerce.commissionSplit(10000, commerce.commissionPolicy({
  HAVKAR_SERVICE_COMMISSION_BPS: "1000"
}));
assert.strictEqual(split.commissionCents, 1000);
assert.strictEqual(split.providerCents, 9000);

assert.strictEqual(commerce.cashBookingDecision().createBooking, false);
assert.strictEqual(commerce.cashBookingDecision().code, "cash_commission_not_guaranteed");
assert.strictEqual(commerce.CASH_POLICY.guaranteed, false);
assert.strictEqual(commerce.ONLINE_POLICY.escrowPromised, false);

const disabled = commerce.onlineCheckoutDecision({}, {
  connectedAccountId: "acct_123",
  providerVerified: true,
  amountCents: 10000
});
assert.strictEqual(disabled.callStripe, false);

const change = commerce.proposeAgreementChange({
  customerAcceptedAt: "2026-10-11T00:00:00Z",
  providerAcceptedAt: "2026-10-11T00:00:00Z",
  version: 1
}, {
  silent: true,
  description: "Move furniture",
  scope: "Two rooms",
  price: 80,
  currency: "EUR"
});
assert.strictEqual(change.reason, "silent_rewrite");

const complaint = commerce.complaintDraft({
  bookingId: 4,
  authorId: "customer-1",
  category: "poor_service_quality",
  explanation: "The work did not match the agreed scope."
});
assert.strictEqual(complaint.ok, true);
assert.strictEqual(complaint.row.status, "submitted");

const review = commerce.reviewDraft({
  bookingId: 4,
  customerId: "customer-1",
  providerId: "provider-1",
  bookingCustomerId: "customer-1",
  bookingStatus: "completed",
  rating: 2,
  reviewText: "The visit was incomplete."
});
assert.strictEqual(review.ok, true);
assert.strictEqual(commerce.reviewDraft({
  bookingId: 4,
  customerId: "provider-1",
  providerId: "provider-1",
  bookingCustomerId: "provider-1",
  bookingStatus: "completed",
  rating: 5,
  reviewText: "I rate myself highly."
}).reason, "self_review");
assert.strictEqual(commerce.providerCanEditReview({ provider_response: "Thank you." }), true);
assert.strictEqual(commerce.providerCanEditReview({ rating: 5, provider_response: "Changed." }), false);

const profile = commerce.publicProfile({
  user_id: "provider-1",
  display_name: "North Studio",
  phone: "+390000",
  verification_status: "pending"
});
assert.strictEqual(profile.phone, null);
assert.strictEqual(profile.verifiedBadge, false);
assert.strictEqual(profile.verification_status, "unverified");

const generated = commerce.generateCompletionCode();
assert.strictEqual(generated.ok, true);
assert.strictEqual(generated.code.length, 8);
const hashed = commerce.hashCompletionCode(generated.code, 4, "pepper");
const accepted = commerce.judgeCompletionAttempt({
  expectedHash: hashed.hash,
  submittedHash: hashed.hash,
  attempts: 0,
  expiresAt: "2026-10-12T00:00:00Z",
  usedAt: null,
  now: Date.parse("2026-10-11T00:00:00Z")
});
assert.strictEqual(accepted.ok, true);
assert.strictEqual(accepted.qualityAccepted, false);
assert.strictEqual(accepted.cashPaid, false);
assert.strictEqual(commerce.judgeCompletionAttempt({
  expectedHash: hashed.hash,
  submittedHash: "0".repeat(hashed.hash.length),
  attempts: 4,
  expiresAt: "2026-10-12T00:00:00Z",
  now: Date.parse("2026-10-11T00:00:00Z")
}).reason, "invalid_code");
assert.strictEqual(commerce.judgeCompletionAttempt({
  expectedHash: hashed.hash,
  submittedHash: hashed.hash,
  attempts: 5,
  expiresAt: "2026-10-12T00:00:00Z",
  now: Date.parse("2026-10-11T00:00:00Z")
}).reason, "too_many_attempts");
assert.strictEqual(commerce.completionDelivery("provider").providerSeesCode, false);

assert.strictEqual(services.providerBookingTransition("accepted", "completed"), false);
assert.strictEqual(services.providerBookingTransition("accepted", "completion_requested"), true);
assert.strictEqual(commerce.safeServiceImage("javascript:alert(1)"), "");
assert.strictEqual(commerce.safeServiceImage("http://example.com/a.jpg"), "");

const migration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20261011120100_services_booking_security.sql"),
  "utf8"
);
assert.strictEqual(migration.includes("DELETE FROM public.service_bookings"), false);
assert.ok(migration.includes("s.provider_id = service_bookings.provider_id") || migration.includes("service.provider_id = service_bookings.provider_id"));
assert.ok(migration.includes("service-images"));
assert.strictEqual(migration.includes("ad-images"), true);
assert.ok(migration.includes("does not use the ad-images bucket"));
assert.ok(migration.includes("service_reviews"));
assert.ok(migration.includes("service_complaints"));
