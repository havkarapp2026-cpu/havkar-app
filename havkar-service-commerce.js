/*
 * HAVKAR service agreements, complaints, reviews, and payment policy.
 *
 * The commission rate is not approved. This module never assumes 10%
 * or any other rate. Cash bookings stay unavailable because a card
 * authorization expires and cannot guarantee a later commission.
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

  const CASH_POLICY = {
    available: false,
    guaranteed: false,
    reason: "cash_commission_not_guaranteed",
    summary: "A card authorization expires, and a saved card can be declined later. HAVKAR does not treat either one as guaranteed commission coverage, so cash bookings stay closed."
  };

  const ONLINE_POLICY = {
    architecture: "stripe_connect_separate_charge_and_transfer",
    escrowPromised: false,
    guaranteedRefundPromised: false,
    summary: "Separate charges and transfers can delay a provider transfer until completion. Destination charges move funds immediately. Neither one is escrow, and refunds are not guaranteed."
  };

  function commissionPolicy(env) {
    const raw = env && env.HAVKAR_SERVICE_COMMISSION_BPS;
    if (raw == null || String(raw).trim() === "") {
      return { ok: false, reason: "commission_not_configured" };
    }
    if (!/^\d+$/.test(String(raw).trim())) {
      return { ok: false, reason: "commission_not_configured" };
    }
    const bps = Number(String(raw).trim());
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
      return { ok: false, reason: "commission_not_configured" };
    }
    return { ok: true, bps: bps };
  }

  function commissionSplit(amountCents, policy) {
    if (!policy || policy.ok !== true) {
      return { ok: false, reason: "commission_not_configured" };
    }
    if (!Number.isInteger(amountCents) || amountCents < 0) {
      return { ok: false, reason: "invalid_amount" };
    }
    const commissionCents = Math.round(amountCents * policy.bps / 10000);
    return {
      ok: true,
      bps: policy.bps,
      commissionCents: commissionCents,
      providerCents: amountCents - commissionCents
    };
  }

  function servicePaymentsEnabled(env) {
    return Boolean(env) && env.HAVKAR_SERVICE_PAYMENTS_ENABLED === "true";
  }

  function onlineCheckoutDecision(env, input) {
    const policy = commissionPolicy(env);
    if (!servicePaymentsEnabled(env)) {
      return {
        status: 503,
        callStripe: false,
        code: "service_payments_disabled",
        error: "Service payments are not enabled."
      };
    }
    if (!policy.ok) {
      return {
        status: 503,
        callStripe: false,
        code: "commission_not_configured",
        error: "The service commission rate is not configured."
      };
    }
    const source = input || {};
    if (!source.connectedAccountId || !source.providerVerified) {
      return {
        status: 503,
        callStripe: false,
        code: "provider_not_ready",
        error: "The provider has no verified Stripe connected account."
      };
    }
    const split = commissionSplit(source.amountCents, policy);
    if (!split.ok) {
      return {
        status: 400,
        callStripe: false,
        code: split.reason,
        error: "The service amount cannot be split."
      };
    }
    return {
      status: 200,
      callStripe: true,
      code: "ready",
      chargeType: "separate_charge_and_transfer",
      transferImmediately: false,
      escrow: false,
      split: split
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
    CASH_POLICY: CASH_POLICY,
    ONLINE_POLICY: ONLINE_POLICY,
    commissionPolicy: commissionPolicy,
    commissionSplit: commissionSplit,
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
    safeServiceImage: safeServiceImage
  };

});
