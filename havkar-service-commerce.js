/*
 * HAVKAR service agreements, complaints, reviews, and payment policy.
 *
 * The approved commission is exactly 10% (1000 basis points).
 * The provider alone pays it. The customer pays the agreed price
 * and no extra HAVKAR commission. Browser amounts are never used
 * as the charge. Cash bookings stay closed because a saved card
 * or an expiring authorization does not guarantee collection.
 * Stripe is not called from this file.
 */
(function (root, factory) {

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.HAVKAR_SERVICE_COMMERCE = api;

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  const COMPLAINT_CATEGORIES = [
    "service_not_completed",
    "poor_service_quality",
    "incorrect_price",
    "payment_disagreement",
    "provider_did_not_arrive",
    "customer_did_not_pay",
    "other"
  ];

  const COMPLAINT_STATUSES = [
    "submitted",
    "awaiting_review",
    "resolved",
    "closed"
  ];

  const PUBLIC_PROFILE_FIELDS = [
    "user_id",
    "display_name",
    "avatar_url",
    "description",
    "service_area",
    "verification_status"
  ];

  const APPROVED_COMMISSION_BPS = 1000;

  const CASH_POLICY = {
    available: false,
    guaranteed: false,
    reason: "cash_commission_not_guaranteed",
    summary: "The provider owes HAVKAR 10% of a completed cash booking. A saved card can be declined and an authorization expires, so that debt is not treated as secured and cash bookings stay closed."
  };

  const ONLINE_POLICY = {
    architecture: "stripe_connect_destination_charge",
    applicationFeePayer: "provider",
    customerSurchargeBps: 0,
    escrowPromised: false,
    guaranteedRefundPromised: false,
    summary: "The customer pays the agreed price. Stripe Connect keeps HAVKAR's 10% application fee from the provider settlement. Processing fees and taxes are separate. This is not escrow."
  };

  function commissionPolicy(env) {
    const raw = env && env.HAVKAR_SERVICE_COMMISSION_BPS;
    if (raw != null && String(raw).trim() !== "" && String(raw).trim() !== String(APPROVED_COMMISSION_BPS)) {
      return { ok: false, reason: "commission_rate_mismatch" };
    }
    return {
      ok: true,
      bps: APPROVED_COMMISSION_BPS,
      payer: "provider",
      customerSurchargeBps: 0
    };
  }

  function priceToCents(value) {
    const text = String(value == null ? "" : value).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(text)) {
      return null;
    }
    const parts = text.split(".");
    const whole = Number(parts[0]);
    const fraction = Number(((parts[1] || "") + "00").slice(0, 2));
    if (!Number.isInteger(whole) || !Number.isInteger(fraction)) {
      return null;
    }
    return whole * 100 + fraction;
  }

  function settleProviderCommission(agreedCents, claim) {
    const policy = commissionPolicy();
    if (!policy.ok) {
      return policy;
    }
    if (!Number.isInteger(agreedCents) || agreedCents < 0) {
      return { ok: false, reason: "invalid_amount" };
    }
    const commissionCents = Math.round(agreedCents * policy.bps / 10000);
    const settlement = {
      agreedCents: agreedCents,
      customerChargeCents: agreedCents,
      customerSurchargeCents: 0,
      commissionBps: policy.bps,
      commissionCents: commissionCents,
      providerSettlementCents: agreedCents - commissionCents,
      payer: "provider"
    };
    const supplied = claim || {};
    if (supplied.customerChargeCents != null && Number(supplied.customerChargeCents) !== settlement.customerChargeCents) {
      return { ok: false, reason: "customer_price_mismatch", settlement: settlement };
    }
    if (supplied.commissionCents != null && Number(supplied.commissionCents) !== settlement.commissionCents) {
      return { ok: false, reason: "commission_not_trusted", settlement: settlement };
    }
    if (supplied.commissionBps != null && Number(supplied.commissionBps) !== policy.bps) {
      return { ok: false, reason: "commission_not_trusted", settlement: settlement };
    }
    return { ok: true, settlement: settlement };
  }

  function commissionSplit(amountCents, policy) {
    const approved = commissionPolicy();
    if (!approved.ok) {
      return approved;
    }
    if (policy && policy.bps != null && Number(policy.bps) !== approved.bps) {
      return { ok: false, reason: "commission_not_trusted" };
    }
    const settled = settleProviderCommission(amountCents, null);
    if (!settled.ok) {
      return settled;
    }
    return {
      ok: true,
      bps: settled.settlement.commissionBps,
      payer: "provider",
      commissionCents: settled.settlement.commissionCents,
      providerCents: settled.settlement.providerSettlementCents,
      customerChargeCents: settled.settlement.customerChargeCents
    };
  }

  function commissionLedgerDecision(existingEntry, settlement) {
    if (!settlement || settlement.ok !== true) {
      return settlement || { ok: false, reason: "invalid_amount" };
    }
    if (existingEntry && existingEntry.booking_id != null) {
      return {
        ok: true,
        duplicate: true,
        chargeAgain: false,
        additionalCommissionCents: 0,
        settlement: {
          agreedCents: existingEntry.agreed_amount_cents,
          customerChargeCents: existingEntry.customer_charge_cents,
          commissionBps: existingEntry.commission_bps,
          commissionCents: existingEntry.commission_cents,
          providerSettlementCents: existingEntry.provider_settlement_cents,
          payer: "provider"
        }
      };
    }
    return {
      ok: true,
      duplicate: false,
      chargeAgain: true,
      additionalCommissionCents: settlement.settlement.commissionCents,
      settlement: settlement.settlement
    };
  }

  function servicePaymentsEnabled(env) {
    return Boolean(env) && env.HAVKAR_SERVICE_PAYMENTS_ENABLED === "true";
  }

  function onlineCheckoutDecision(env, input) {
    const policy = commissionPolicy(env);
    if (!policy.ok) {
      return {
        status: 503,
        callStripe: false,
        code: policy.reason,
        error: "The approved service commission rate is 1000 basis points."
      };
    }
    if (!servicePaymentsEnabled(env)) {
      return {
        status: 503,
        callStripe: false,
        code: "service_payments_disabled",
        error: "Service payments are not enabled. The customer has not been charged."
      };
    }
    const source = input || {};
    const settled = settleProviderCommission(source.agreedCents, {
      customerChargeCents: source.clientCustomerChargeCents,
      commissionCents: source.clientCommissionCents,
      commissionBps: source.clientCommissionBps
    });
    if (!settled.ok) {
      return {
        status: 400,
        callStripe: false,
        code: settled.reason,
        error: "The browser amount was not used. No charge was created."
      };
    }
    if (!source.connectedAccountId || source.providerVerified !== true) {
      return {
        status: 503,
        callStripe: false,
        code: "provider_not_ready",
        error: "The provider has no verified Stripe connected account. No charge was created."
      };
    }
    return {
      status: 200,
      callStripe: true,
      code: "ready",
      chargeType: "destination_charge",
      transferImmediately: true,
      escrow: false,
      customerChargeCents: settled.settlement.customerChargeCents,
      applicationFeeCents: settled.settlement.commissionCents,
      providerSettlementCents: settled.settlement.providerSettlementCents,
      payer: "provider",
      split: settled.settlement
    };
  }

  function cashBookingDecision() {
    return {
      status: 403,
      callStripe: false,
      code: CASH_POLICY.reason,
      error: CASH_POLICY.summary,
      createBooking: false
    };
  }

  function agreementSnapshot(input) {
    const source = input || {};
    const description = String(source.description || "").trim();
    const scope = String(source.scope || "").trim();
    const currency = String(source.currency || "").trim().toUpperCase();
    const price = Number(source.price);
    if (description.length < 3 || scope.length < 3) {
      return { ok: false, reason: "invalid_agreement" };
    }
    if (!Number.isFinite(price) || price < 0) {
      return { ok: false, reason: "invalid_price" };
    }
    if (["EUR", "USD", "GBP", "SEK"].indexOf(currency) === -1) {
      return { ok: false, reason: "invalid_currency" };
    }
    return {
      ok: true,
      snapshot: {
        description: description,
        scope: scope,
        price: price,
        currency: currency,
        appointmentDate: source.appointmentDate || null,
        appointmentTime: source.appointmentTime || null,
        paymentMethod: source.paymentMethod === "online" ? "online" : null,
        cancellationTerms: String(source.cancellationTerms || "").trim()
      }
    };
  }

  function proposeAgreementChange(agreement, change) {
    const current = agreement || {};
    const proposal = change || {};
    if (!current.customerAcceptedAt || !current.providerAcceptedAt) {
      return { ok: false, reason: "not_accepted" };
    }
    if (proposal.silent === true) {
      return { ok: false, reason: "silent_rewrite" };
    }
    if (!proposal.proposedBy || !proposal.approvedBy || proposal.proposedBy === proposal.approvedBy) {
      return { ok: false, reason: "counterparty_approval_required" };
    }
    const next = agreementSnapshot(proposal);
    if (!next.ok) {
      return next;
    }
    return {
      ok: true,
      revision: {
        previousVersion: Number(current.version) || 1,
        nextVersion: (Number(current.version) || 1) + 1,
        snapshot: next.snapshot,
        proposedBy: proposal.proposedBy,
        approvedBy: proposal.approvedBy
      }
    };
  }

  function complaintDraft(input) {
    const source = input || {};
    const category = String(source.category || "");
    const explanation = String(source.explanation || "").trim();
    if (COMPLAINT_CATEGORIES.indexOf(category) === -1) {
      return { ok: false, reason: "invalid_category" };
    }
    if (explanation.length < 10 || explanation.length > 4000) {
      return { ok: false, reason: "invalid_explanation" };
    }
    return {
      ok: true,
      row: {
        booking_id: source.bookingId,
        author_id: source.authorId,
        category: category,
        explanation: explanation,
        status: "submitted"
      }
    };
  }

  function reviewDraft(input) {
    const source = input || {};
    const rating = Number(source.rating);
    const text = String(source.reviewText || "").trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return { ok: false, reason: "invalid_rating" };
    }
    if (text.length < 5 || text.length > 1000) {
      return { ok: false, reason: "invalid_review" };
    }
    if (!source.bookingId || !source.customerId || !source.providerId) {
      return { ok: false, reason: "missing_booking" };
    }
    if (String(source.customerId) === String(source.providerId)) {
      return { ok: false, reason: "self_review" };
    }
    if (source.bookingCustomerId && String(source.bookingCustomerId) !== String(source.customerId)) {
      return { ok: false, reason: "not_booking_customer" };
    }
    if (["completed", "in_review"].indexOf(source.bookingStatus) === -1) {
      return { ok: false, reason: "booking_not_eligible" };
    }
    return {
      ok: true,
      row: {
        booking_id: source.bookingId,
        customer_id: source.customerId,
        provider_id: source.providerId,
        rating: rating,
        review_text: text,
        status: "published"
      }
    };
  }

  function providerCanEditReview(patch) {
    const fields = Object.keys(patch || {});
    return fields.length > 0 && fields.every(function (field) {
      return field === "provider_response";
    });
  }

  function publicProfile(row) {
    const source = row || {};
    const profile = {};
    PUBLIC_PROFILE_FIELDS.forEach(function (field) {
      if (field === "verification_status") {
        profile.verification_status = source.verification_status === "verified" ? "verified" : "unverified";
        return;
      }
      profile[field] = source[field] == null ? null : source[field];
    });
    profile.phone = null;
    profile.verifiedBadge = profile.verification_status === "verified";
    return profile;
  }

  function hashCompletionCode(code, bookingId, pepper) {
    if (!pepper) {
      return { ok: false, reason: "pepper_not_configured" };
    }
    let nodeCrypto = null;
    try {
      nodeCrypto = require("crypto");
    } catch (error) {
      nodeCrypto = null;
    }
    if (!nodeCrypto || !nodeCrypto.createHash) {
      return { ok: false, reason: "secure_hash_unavailable" };
    }
    const digest = nodeCrypto
      .createHash("sha256")
      .update(String(pepper) + ":" + String(bookingId) + ":" + String(code))
      .digest("hex");
    return { ok: true, hash: digest };
  }

  function generateCompletionCode() {
    let nodeCrypto = null;
    try {
      nodeCrypto = require("crypto");
    } catch (error) {
      nodeCrypto = null;
    }
    if (!nodeCrypto || !nodeCrypto.randomInt) {
      return { ok: false, reason: "secure_random_unavailable" };
    }
    return {
      ok: true,
      code: String(nodeCrypto.randomInt(0, 100000000)).padStart(8, "0")
    };
  }

  function judgeCompletionAttempt(attempt) {
    const source = attempt || {};
    const now = typeof source.now === "number" ? source.now : Date.now();
    if (source.usedAt) {
      return { ok: false, reason: "already_used" };
    }
    if (!source.expiresAt || Date.parse(source.expiresAt) <= now) {
      return { ok: false, reason: "expired" };
    }
    if (!Number.isInteger(source.attempts) || source.attempts >= 5) {
      return { ok: false, reason: "too_many_attempts" };
    }
    if (!source.expectedHash || !source.submittedHash || source.expectedHash.length !== source.submittedHash.length) {
      return { ok: false, reason: "invalid_code", attempts: source.attempts + 1 };
    }
    let same = true;
    for (let i = 0; i < source.expectedHash.length; i += 1) {
      if (source.expectedHash.charCodeAt(i) !== source.submittedHash.charCodeAt(i)) {
        same = false;
      }
    }
    if (!same) {
      return { ok: false, reason: "invalid_code", attempts: source.attempts + 1 };
    }
    return {
      ok: true,
      qualityAccepted: false,
      cashPaid: false,
      attempts: source.attempts + 1
    };
  }

  function completionDelivery(role) {
    return {
      providerSeesCode: false,
      customerSeesCode: role === "customer"
    };
  }

  function completionRequestDecision(env, input) {
    const source = input || {};
    if (source.role !== "provider" || !source.userId || String(source.userId) !== String(source.bookingProviderId)) {
      return {
        ok: false,
        status: 403,
        code: "not_provider",
        error: "Only the provider on this booking can request completion. The booking was not changed."
      };
    }
    if (source.bookingStatus !== "accepted") {
      return {
        ok: false,
        status: 409,
        code: "booking_not_ready",
        error: "Completion can be requested only after the booking is accepted. The booking was not marked completed."
      };
    }
    const pepper = env && env.HAVKAR_COMPLETION_CODE_PEPPER;
    if (!pepper) {
      return {
        ok: false,
        status: 503,
        code: "completion_pepper_not_configured",
        error: "Completion codes are not configured. The booking was not marked completed."
      };
    }
    const generated = generateCompletionCode();
    if (!generated.ok) {
      return {
        ok: false,
        status: 503,
        code: generated.reason,
        error: "A completion code could not be created. The booking was not marked completed."
      };
    }
    const hashed = hashCompletionCode(generated.code, source.bookingId, pepper);
    if (!hashed.ok) {
      return {
        ok: false,
        status: 503,
        code: hashed.reason,
        error: "A completion code could not be created. The booking was not marked completed."
      };
    }
    const now = typeof source.now === "number" ? source.now : Date.now();
    return {
      ok: true,
      status: 200,
      revealCodeToProvider: false,
      storePlaintext: false,
      completed: false,
      cashPaid: false,
      delivery: {
        customerId: source.bookingCustomerId,
        bookingId: source.bookingId,
        code: generated.code,
        codeHash: hashed.hash,
        expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString()
      }
    };
  }

  function providerCompletionResponse(decision) {
    const source = decision || {};
    return {
      ok: source.ok === true,
      code: source.ok === true ? "completion_code_sent" : (source.code || "completion_unavailable"),
      revealCodeToProvider: false,
      completed: false,
      cashPaid: false,
      error: source.ok === true
        ? "A completion code was sent only to the customer. The booking was not marked completed."
        : (source.error || "Completion confirmation is not available. The booking was not marked completed.")
    };
  }

  function isUniqueViolation(error) {
    if (!error) return false;
    return error.code === "23505" || /duplicate key/i.test(String(error.message || ""));
  }

  function isMissingRelation(error) {
    if (!error) return false;
    return error.code === "42P01" ||
      error.code === "PGRST205" ||
      /schema cache|does not exist|Could not find the/i.test(String(error.message || ""));
  }

  async function applyVerifiedServicePayment(input) {
    const supabase = input && input.supabase;
    const event = input && input.event;
    const session = input && input.session;
    if (!supabase || !event || !event.id || !session) {
      return { ok: false, retry: false, activated: false, reason: "invalid_event" };
    }
    if (session.payment_status !== "paid") {
      return { ok: false, retry: false, activated: false, reason: "not_paid" };
    }
    const bookingId = session.metadata && session.metadata.booking_id;
    const customerId = session.metadata && session.metadata.customer_id;
    if (!bookingId || !customerId) {
      return { ok: false, retry: false, activated: false, reason: "missing_booking" };
    }

    const bookingResult = await supabase
      .from("service_bookings")
      .select("id,customer_id,provider_id,agreed_price,currency,payment_method")
      .eq("id", bookingId)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (bookingResult.error) {
      return {
        ok: false,
        retry: isMissingRelation(bookingResult.error),
        activated: false,
        reason: "booking_lookup_failed"
      };
    }
    if (!bookingResult.data || bookingResult.data.payment_method === "cash") {
      return { ok: false, retry: false, activated: false, reason: "booking_not_payable" };
    }

    const agreedCents = priceToCents(bookingResult.data.agreed_price);
    const settled = settleProviderCommission(agreedCents, {
      customerChargeCents: session.amount_total
    });
    if (!settled.ok || String(session.currency || "").toLowerCase() !== String(bookingResult.data.currency || "").toLowerCase()) {
      return { ok: false, retry: false, activated: false, reason: settled.reason || "amount_mismatch" };
    }
    if (!Number.isInteger(input.verifiedApplicationFeeCents) ||
        input.verifiedApplicationFeeCents !== settled.settlement.commissionCents) {
      return { ok: false, retry: false, activated: false, reason: "application_fee_mismatch" };
    }

    const providerResult = await supabase
      .from("service_provider_profiles")
      .select("user_id,stripe_account_id")
      .eq("user_id", bookingResult.data.provider_id)
      .maybeSingle();
    if (providerResult.error) {
      return {
        ok: false,
        retry: isMissingRelation(providerResult.error),
        activated: false,
        reason: "provider_lookup_failed"
      };
    }
    const accountId = providerResult.data && providerResult.data.stripe_account_id;
    if (!accountId || String(input.verifiedTransferDestination || "") !== String(accountId)) {
      return { ok: false, retry: false, activated: false, reason: "destination_mismatch" };
    }

    const existing = await supabase
      .from("service_commission_entries")
      .select("booking_id,agreed_amount_cents,customer_charge_cents,commission_bps,commission_cents,provider_settlement_cents")
      .eq("booking_id", bookingResult.data.id)
      .maybeSingle();

    if (existing.error && !isMissingRelation(existing.error)) {
      return { ok: false, retry: true, activated: false, reason: "ledger_lookup_failed" };
    }
    const ledger = commissionLedgerDecision(existing.data, settled);
    if (ledger.duplicate) {
      return {
        ok: true,
        duplicate: true,
        activated: false,
        additionalCommissionCents: 0,
        settlement: ledger.settlement
      };
    }

    const inserted = await supabase
      .from("service_commission_entries")
      .insert({
        booking_id: bookingResult.data.id,
        agreed_amount_cents: settled.settlement.agreedCents,
        currency: bookingResult.data.currency,
        customer_charge_cents: settled.settlement.customerChargeCents,
        commission_bps: settled.settlement.commissionBps,
        commission_cents: settled.settlement.commissionCents,
        provider_settlement_cents: settled.settlement.providerSettlementCents,
        payer: "provider",
        stripe_event_id: event.id
      })
      .select("booking_id");

    if (inserted.error && isUniqueViolation(inserted.error)) {
      return { ok: true, duplicate: true, activated: false, additionalCommissionCents: 0 };
    }
    if (inserted.error) {
      return {
        ok: false,
        retry: isMissingRelation(inserted.error),
        activated: false,
        reason: "ledger_insert_failed"
      };
    }

    await supabase
      .from("service_bookings")
      .update({
        commission_bps: settled.settlement.commissionBps,
        commission_amount: settled.settlement.commissionCents / 100
      })
      .eq("id", bookingResult.data.id)
      .is("commission_bps", null);

    return {
      ok: true,
      duplicate: false,
      activated: false,
      additionalCommissionCents: settled.settlement.commissionCents,
      settlement: settled.settlement
    };
  }

  function safeServiceImage(value) {
    if (!value) return "";
    try {
      const url = new URL(String(value));
      if (url.protocol !== "https:") return "";
      if (url.username || url.password) return "";
      return url.href;
    } catch (error) {
      return "";
    }
  }

  return {
    COMPLAINT_CATEGORIES: COMPLAINT_CATEGORIES,
    COMPLAINT_STATUSES: COMPLAINT_STATUSES,
    PUBLIC_PROFILE_FIELDS: PUBLIC_PROFILE_FIELDS,
    APPROVED_COMMISSION_BPS: APPROVED_COMMISSION_BPS,
    CASH_POLICY: CASH_POLICY,
    ONLINE_POLICY: ONLINE_POLICY,
    commissionPolicy: commissionPolicy,
    commissionSplit: commissionSplit,
    priceToCents: priceToCents,
    settleProviderCommission: settleProviderCommission,
    commissionLedgerDecision: commissionLedgerDecision,
    applyVerifiedServicePayment: applyVerifiedServicePayment,
    servicePaymentsEnabled: servicePaymentsEnabled,
    onlineCheckoutDecision: onlineCheckoutDecision,
    cashBookingDecision: cashBookingDecision,
    agreementSnapshot: agreementSnapshot,
    proposeAgreementChange: proposeAgreementChange,
    complaintDraft: complaintDraft,
    reviewDraft: reviewDraft,
    providerCanEditReview: providerCanEditReview,
    publicProfile: publicProfile,
    hashCompletionCode: hashCompletionCode,
    generateCompletionCode: generateCompletionCode,
    judgeCompletionAttempt: judgeCompletionAttempt,
    completionDelivery: completionDelivery,
    completionRequestDecision: completionRequestDecision,
    providerCompletionResponse: providerCompletionResponse,
    safeServiceImage: safeServiceImage
  };

});
