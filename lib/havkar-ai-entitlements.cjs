/*
 * Server-side HAVKAR AI paid entitlement checks (Node mirror of edge policy).
 * Paid image/logo output requires an active paid plan row — never trust the browser.
 * Live Stripe subscription collection remains Owner-gated separately.
 */

const PAID_PLANS = Object.freeze(["plus", "pro", "business"]);

const AI_CREDIT_TO_PLAN = Object.freeze({
  ai_credits_plus: "plus",
  ai_credits_pro: "pro",
  ai_credits_business: "business"
});

function paidPlan(value) {
  const plan = String(value || "").trim().toLowerCase();
  return PAID_PLANS.includes(plan) ? plan : "";
}

function planFromCreditPack(subjectId) {
  const id = String(subjectId || "").trim().toLowerCase();
  return AI_CREDIT_TO_PLAN[id] || "";
}

function activePlan(row, now = Date.now()) {
  const plan = paidPlan(row && row.plan_code);
  const period = row && row.current_period_end ? Date.parse(row.current_period_end) : NaN;
  const current = Number.isFinite(now) ? now : Date.now();
  const periodOpen = !Number.isFinite(period) || period > current;
  if (row && row.status === "active" && plan && periodOpen) return plan;
  return "free";
}

function imageGenerationRequested(input) {
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  if (String(body.mode || "").trim().toLowerCase() === "image") return true;
  if (String(body.aspect || "").trim()) return true;
  if (Object.prototype.hasOwnProperty.call(body, "variations")) return true;
  if (body.transparent === true) return true;
  const logo = body.logo && typeof body.logo === "object" ? body.logo : {};
  return ["name", "industry", "colors", "style", "description"].some((key) =>
    String(logo[key] || "").trim()
  );
}

/**
 * @param {object} verification - { ok, row } from ai_subscriptions lookup, or { review:true }
 * @param {object} requestBodyInput - AI request body
 */
function logoEntitlementDecision(verification, requestBodyInput, now = Date.now()) {
  if (!imageGenerationRequested(requestBodyInput)) {
    return {
      required: false,
      allowed: true,
      status: 200,
      plan: "n/a",
      reason: "not_image_generation"
    };
  }
  if (verification && verification.review === true) {
    return {
      required: true,
      allowed: true,
      status: 200,
      plan: "business",
      reason: "play_review_bypass"
    };
  }
  if (!verification || verification.ok !== true) {
    return {
      required: true,
      allowed: false,
      status: 503,
      plan: "free",
      reason: "subscription_lookup_unavailable"
    };
  }
  const plan = activePlan(verification.row, now);
  if (plan === "free") {
    return {
      required: true,
      allowed: false,
      status: 403,
      plan: "free",
      reason: "paid_plan_required",
      error: "Image generation requires an active paid HAVKAR AI plan."
    };
  }
  return {
    required: true,
    allowed: true,
    status: 200,
    plan,
    reason: "active_paid_subscription"
  };
}

function refuseUnverifiedPaidOutput(reason) {
  return {
    ok: false,
    status: 403,
    fulfilled: false,
    paid: false,
    code: "AI_PAID_ENTITLEMENT_REQUIRED",
    error:
      reason ||
      "Paid logo/image output requires a verified active HAVKAR AI entitlement. No file was issued."
  };
}

/**
 * Map a verified prepaid ai_credits settlement into a plan_code for entitlement.
 * Does not activate Stripe live collection.
 */
function entitlementFromVerifiedPrepaidCredit(settlement) {
  const subject = String(
    (settlement && (settlement.subject_id || settlement.subjectId)) || ""
  );
  const plan = planFromCreditPack(subject);
  if (!plan) {
    return { ok: false, error: "unknown_ai_credit_pack" };
  }
  if (!settlement || settlement.order_paid !== true || settlement.paid !== true) {
    return {
      ok: false,
      error: "settlement_not_verified",
      note: "Transaction hash alone is not proof. Horizon/Stripe verification required."
    };
  }
  const periodDays = 30;
  const end = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000).toISOString();
  return {
    ok: true,
    plan_code: plan,
    status: "active",
    current_period_end: end,
    source: "verified_prepaid_ai_credits",
    billing: "one_time_prepaid",
    live_collection: false
  };
}

module.exports = {
  PAID_PLANS,
  AI_CREDIT_TO_PLAN,
  paidPlan,
  planFromCreditPack,
  activePlan,
  imageGenerationRequested,
  logoEntitlementDecision,
  refuseUnverifiedPaidOutput,
  entitlementFromVerifiedPrepaidCredit
};
