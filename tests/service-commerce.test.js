"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const commerce = require("../havkar-service-commerce.js");
const services = require("../havkar-services.js");

assert.strictEqual(commerce.APPROVED_COMMISSION_BPS, 1000);
assert.strictEqual(commerce.commissionPolicy({}).ok, true);
assert.strictEqual(commerce.commissionPolicy({}).bps, 1000);
assert.strictEqual(commerce.commissionPolicy({}).payer, "provider");
assert.strictEqual(commerce.commissionPolicy({ HAVKAR_SERVICE_COMMISSION_BPS: "500" }).reason, "commission_rate_mismatch");
assert.strictEqual(commerce.commissionSplit(10000, { bps: 500 }).reason, "commission_not_trusted");
const split = commerce.commissionSplit(10000, commerce.commissionPolicy({}));
assert.strictEqual(split.commissionCents, 1000);
assert.strictEqual(split.providerCents, 9000);
assert.strictEqual(split.customerChargeCents, 10000);
assert.strictEqual(split.payer, "provider");

const hundred = commerce.settleProviderCommission(commerce.priceToCents("100.00"), {
  customerChargeCents: 10000
});
assert.strictEqual(hundred.settlement.customerChargeCents, 10000);
assert.strictEqual(hundred.settlement.customerSurchargeCents, 0);
assert.strictEqual(hundred.settlement.commissionCents, 1000);
assert.strictEqual(hundred.settlement.providerSettlementCents, 9000);
assert.strictEqual(commerce.priceToCents("100.50"), 10050);
assert.strictEqual(commerce.settleProviderCommission(10000, { commissionCents: 0 }).reason, "commission_not_trusted");
assert.strictEqual(commerce.settleProviderCommission(10000, { customerChargeCents: 11000 }).reason, "customer_price_mismatch");
const second = commerce.commissionLedgerDecision({
  booking_id: 4,
  agreed_amount_cents: 10000,
  customer_charge_cents: 10000,
  commission_bps: 1000,
  commission_cents: 1000,
  provider_settlement_cents: 9000
}, hundred);
assert.strictEqual(second.duplicate, true);
assert.strictEqual(second.additionalCommissionCents, 0);
assert.strictEqual(second.chargeAgain, false);

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
const tampered = commerce.onlineCheckoutDecision({
  HAVKAR_SERVICE_PAYMENTS_ENABLED: "true"
}, {
  agreedCents: 10000,
  connectedAccountId: "acct_123",
  providerVerified: true,
  clientCustomerChargeCents: 11000
});
assert.strictEqual(tampered.callStripe, false);
assert.strictEqual(tampered.code, "customer_price_mismatch");
const ready = commerce.onlineCheckoutDecision({
  HAVKAR_SERVICE_PAYMENTS_ENABLED: "true"
}, {
  agreedCents: 10000,
  connectedAccountId: "acct_123",
  providerVerified: true
});
assert.strictEqual(ready.callStripe, true);
assert.strictEqual(ready.customerChargeCents, 10000);
assert.strictEqual(ready.applicationFeeCents, 1000);
assert.strictEqual(ready.providerSettlementCents, 9000);
assert.strictEqual(ready.escrow, false);

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
assert.ok(migration.includes("DROP TRIGGER IF EXISTS enforce_service_booking_write ON public.service_bookings"));
assert.ok(migration.includes("DROP FUNCTION IF EXISTS public.enforce_service_booking_write()"));
assert.ok(migration.includes("NEW.booking_date IS DISTINCT FROM OLD.booking_date"));
assert.ok(migration.includes("NEW.message IS DISTINCT FROM OLD.message"));
assert.ok(migration.includes("commission_bps = 1000"));
assert.ok(migration.includes("customer_charge_cents = agreed_amount_cents"));
assert.ok(migration.includes("service_review_public"));
assert.strictEqual(migration.includes("code_plaintext"), false);
assert.ok(migration.includes("security_invoker = true"));
assert.strictEqual(/GRANT SELECT \([^)]*stripe_account_id/.test(migration), false);
assert.ok(migration.includes("GRANT SELECT (booking_id, expires_at, used_at, attempts)"));
assert.strictEqual(/^\s*BEGIN\s*;/m.test(migration), false);
assert.strictEqual(/^\s*COMMIT\s*;/m.test(migration), false);
for (const match of migration.matchAll(/CREATE POLICY\s+("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\s+ON\s+((?:public|storage)\.[A-Za-z_][A-Za-z0-9_]*)/g)) {
  const drop = "DROP POLICY IF EXISTS " + match[1] + " ON " + match[2];
  assert.ok(migration.lastIndexOf(drop, match.index) >= 0, drop);
}

assert.strictEqual(services.providerBookingTransition("pending", "completed"), false);
assert.strictEqual(services.customerBookingTransition("accepted", "completed"), false);

const issued = commerce.completionRequestDecision({
  HAVKAR_COMPLETION_CODE_PEPPER: "test-pepper"
}, {
  role: "provider",
  userId: "provider-1",
  bookingProviderId: "provider-1",
  bookingCustomerId: "customer-1",
  bookingStatus: "accepted",
  bookingId: 9,
  now: Date.parse("2026-10-11T00:00:00Z")
});
const safeCompletion = commerce.providerCompletionResponse(issued);
assert.strictEqual(issued.storePlaintext, false);
assert.strictEqual(safeCompletion.revealCodeToProvider, false);
assert.strictEqual(safeCompletion.completed, false);
assert.strictEqual(JSON.stringify(safeCompletion).includes(issued.delivery.code), false);
assert.strictEqual(commerce.completionRequestDecision({}, {
  role: "provider",
  userId: "provider-1",
  bookingProviderId: "provider-1",
  bookingStatus: "accepted",
  bookingId: 9
}).code, "completion_pepper_not_configured");
assert.strictEqual(commerce.completionRequestDecision({
  HAVKAR_COMPLETION_CODE_PEPPER: "test-pepper"
}, {
  role: "customer",
  userId: "customer-1",
  bookingProviderId: "provider-1",
  bookingStatus: "accepted",
  bookingId: 9
}).code, "not_provider");

const page = fs.readFileSync(path.join(__dirname, "../services.html"), "utf8");
assert.ok(page.includes("The provider alone pays HAVKAR's 10% commission."));
assert.ok(page.includes("completion_requested"));
const commerceApi = fs.readFileSync(path.join(__dirname, "../havkar-commerce-api.js"), "utf8");
const completionRoute = commerceApi.indexOf('action === "request-completion"');
const paymentGate = commerceApi.indexOf("servicePaymentsEnabled");
assert.ok(completionRoute > 0);
assert.ok(completionRoute < paymentGate);

function memoryCommerce(state) {
  return {
    from: function (table) {
      const filters = [];
      const api = {
        select: function () { return api; },
        eq: function (column, value) {
          filters.push(function (row) {
            return String(row[column]) === String(value);
          });
          return api;
        },
        is: function () { return api; },
        maybeSingle: async function () {
          const rows = (state[table] || []).filter(function (row) {
            return filters.every(function (match) { return match(row); });
          });
          return { data: rows[0] || null, error: null };
        },
        insert: function (row) {
          return {
            select: async function () {
              state[table] = state[table] || [];
              if (table === "service_commission_entries" && state[table].some(function (existing) {
                return String(existing.booking_id) === String(row.booking_id);
              })) {
                return { data: null, error: { code: "23505", message: "duplicate key" } };
              }
              state[table].push(Object.assign({}, row));
              return { data: [{ booking_id: row.booking_id }], error: null };
            }
          };
        },
        update: function () {
          const updateApi = {
            eq: function () { return updateApi; },
            is: function () { return updateApi; },
            select: async function () { return { data: [{}], error: null }; }
          };
          return updateApi;
        }
      };
      return api;
    }
  };
}

const ledger = {
  service_bookings: [{
    id: 4,
    customer_id: "customer-1",
    provider_id: "provider-1",
    agreed_price: "100.00",
    currency: "EUR",
    payment_method: "online"
  }],
  service_provider_profiles: [{
    user_id: "provider-1",
    stripe_account_id: "acct_provider"
  }],
  service_commission_entries: []
};
const paidSession = {
  id: "cs_service_1",
  payment_status: "paid",
  amount_total: 10000,
  currency: "eur",
  metadata: { booking_id: "4", customer_id: "customer-1" }
};
async function verifyLedger() {
const paid = await commerce.applyVerifiedServicePayment({
  supabase: memoryCommerce(ledger),
  event: { id: "evt_service_1" },
  session: paidSession,
  verifiedApplicationFeeCents: 1000,
  verifiedTransferDestination: "acct_provider"
});
assert.strictEqual(paid.ok, true);
assert.strictEqual(paid.duplicate, false);
assert.strictEqual(paid.activated, false);
assert.strictEqual(paid.settlement.customerChargeCents, 10000);
assert.strictEqual(paid.settlement.commissionCents, 1000);
assert.strictEqual(paid.settlement.providerSettlementCents, 9000);
assert.strictEqual(paid.settlement.payer, "provider");
assert.strictEqual(ledger.service_commission_entries.length, 1);
const again = await commerce.applyVerifiedServicePayment({
  supabase: memoryCommerce(ledger),
  event: { id: "evt_service_2" },
  session: paidSession,
  verifiedApplicationFeeCents: 1000,
  verifiedTransferDestination: "acct_provider"
});
assert.strictEqual(again.duplicate, true);
assert.strictEqual(again.additionalCommissionCents, 0);
assert.strictEqual(ledger.service_commission_entries.length, 1);
const wrongFee = await commerce.applyVerifiedServicePayment({
  supabase: memoryCommerce(ledger),
  event: { id: "evt_service_3" },
  session: paidSession,
  verifiedApplicationFeeCents: 0,
  verifiedTransferDestination: "acct_provider"
});
assert.strictEqual(wrongFee.reason, "application_fee_mismatch");
assert.strictEqual(wrongFee.activated, false);
const unpaidService = await commerce.applyVerifiedServicePayment({
  supabase: memoryCommerce(ledger),
  event: { id: "evt_service_4" },
  session: Object.assign({}, paidSession, { payment_status: "unpaid" }),
  verifiedApplicationFeeCents: 1000,
  verifiedTransferDestination: "acct_provider"
});
assert.strictEqual(unpaidService.reason, "not_paid");
assert.strictEqual(unpaidService.activated, false);
}

verifyLedger().catch(function (error) {
  console.error(error);
  process.exit(1);
});
