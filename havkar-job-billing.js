/*
 * HAVKAR job billing rules.
 *
 * Ordinary advertisement prices stay at the approved EUR amounts.
 * Company subscription prices and simultaneous advertisement limits
 * are the approved plan limits. This file does not call Stripe and
 * does not mark a payment successful unless a verified Stripe event
 * already matches these rules.
 *
 * Payments stay disabled unless HAVKAR_JOB_PAYMENTS_ENABLED is the
 * exact string "true". That flag is not set by this module.
 */
(function (root, factory) {

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.HAVKAR_JOB_BILLING = api;

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  const ADVERTISEMENT_DAYS = 30;
  const RENEWAL_CAP_DAYS = 62;

  const ORDINARY_PLANS = {
    Basic: {
      cents: 999,
      eur: 9.99,
      durationDays: ADVERTISEMENT_DAYS,
      benefit: "For small businesses and one active job."
    },
    Professional: {
      cents: 1999,
      eur: 19.99,
      durationDays: ADVERTISEMENT_DAYS,
      benefit: "More visibility and multiple active jobs."
    },
    Business: {
      cents: 3999,
      eur: 39.99,
      durationDays: ADVERTISEMENT_DAYS,
      benefit: "For businesses with regular recruitment."
    }
  };

  const COMPANY_PLANS = {
    business: {
      cents: 4999,
      eur: 49.99,
      interval: "month",
      activeAdvertisementLimit: 10
    },
    business_plus: {
      cents: 9999,
      eur: 99.99,
      interval: "month",
      activeAdvertisementLimit: 30
    },
    enterprise: {
      cents: 19999,
      eur: 199.99,
      interval: "month",
      activeAdvertisementLimit: 100
    }
  };

  const FAILURE_POLICY = {
    deleteAdvertisements: false,
    preserveHistory: true,
    hideFromPublicSearch: true,
    summary: "A failed, canceled, or expired company subscription hides its advertisements from public search and does not delete them."
  };

  function paymentsEnabled(env) {
    return Boolean(env) && env.HAVKAR_JOB_PAYMENTS_ENABLED === "true";
  }

  function disabledResponse() {
    return {
      status: 503,
      callStripe: false,
      body: {
        ok: false,
        code: "payments_disabled",
        error: "Job payments are not enabled. No advertisement has been activated.",
        failurePolicy: FAILURE_POLICY
      }
    };
  }

  function ordinaryAmountCents(planName) {
    const plan = ORDINARY_PLANS[planName];
    return plan ? plan.cents : null;
  }

  function companyPlan(planCode) {
    return COMPANY_PLANS[planCode] || null;
  }

  function withinAdvertisementLimit(planCode, activeAdvertisementCount) {
    const plan = companyPlan(planCode);
    if (!plan) {
      return { ok: false, reason: "unknown_plan" };
    }
    if (!Number.isInteger(activeAdvertisementCount) || activeAdvertisementCount < 0) {
      return { ok: false, reason: "invalid_count" };
    }
    if (activeAdvertisementCount >= plan.activeAdvertisementLimit) {
      return {
        ok: false,
        reason: "limit_reached",
        limit: plan.activeAdvertisementLimit
      };
    }
    return {
      ok: true,
      limit: plan.activeAdvertisementLimit,
      countedUnit: "advertisement"
    };
  }

  function subscriptionAllowsPublicAds(subscription, now) {
    if (!subscription || subscription.status !== "active") {
      return false;
    }
    const end = Date.parse(subscription.current_period_end);
    const clock = typeof now === "number" ? now : Date.now();
    return Number.isFinite(end) && end > clock;
  }

  function nextOrdinaryExpiry(nowMs, currentExpiresAt) {
    const clock = Number(nowMs);
    if (!Number.isFinite(clock)) {
      return { ok: false, reason: "invalid_clock" };
    }
    const current = Date.parse(currentExpiresAt);
    const start = Number.isFinite(current) && current > clock ? current : clock;
    const proposed = start + ADVERTISEMENT_DAYS * 24 * 60 * 60 * 1000;
    const cap = clock + RENEWAL_CAP_DAYS * 24 * 60 * 60 * 1000;
    if (proposed > cap) {
      return { ok: false, reason: "renewal_window" };
    }
    return { ok: true, expiresAt: new Date(proposed).toISOString() };
  }

  function amountsMatch(expectedCents, actualCents, currency) {
    return expectedCents != null &&
      Number(actualCents) === expectedCents &&
      String(currency || "").toLowerCase() === "eur";
  }

  function jobCheckoutDecision(env) {
    if (!paymentsEnabled(env)) {
      return disabledResponse();
    }
    return {
      status: 200,
      callStripe: true,
      body: { ok: true }
    };
  }

  function billingPurpose(object) {
    if (!object) return "";
    if (object.metadata && object.metadata.havkar_purpose) {
      return object.metadata.havkar_purpose;
    }
    const details = object.subscription_details ||
      (object.parent && object.parent.subscription_details);
    if (details && details.metadata && details.metadata.havkar_purpose) {
      return details.metadata.havkar_purpose;
    }
    return "";
  }

  function isJobBillingEvent(event) {
    const type = event && event.type;
    const object = event && event.data && event.data.object;
    const purpose = billingPurpose(object);
    if (type === "checkout.session.completed") {
      return purpose === "job_advertisement" || purpose === "job_subscription";
    }
    if (type === "charge.refunded") {
      return purpose === "job_advertisement";
    }
    return purpose === "job_subscription" && (
      type === "invoice.paid" ||
      type === "invoice.payment_failed" ||
      type === "customer.subscription.updated" ||
      type === "customer.subscription.deleted"
    );
  }

  function planCodeFromCents(cents) {
    const amount = Number(cents);
    const codes = Object.keys(COMPANY_PLANS);
    for (let i = 0; i < codes.length; i += 1) {
      if (COMPANY_PLANS[codes[i]].cents === amount) {
        return codes[i];
      }
    }
    return null;
  }

  function decideCheckoutSession(session) {
    const metadata = session && session.metadata || {};
    const purpose = metadata.havkar_purpose;

    if (session && session.metadata && session.metadata.event_ticket_id) {
      return { ok: false, reason: "event_ticket", retry: false };
    }

    if (purpose === "job_advertisement") {
      const expected = ordinaryAmountCents(metadata.plan);
      if (session.mode !== "payment" || session.payment_status !== "paid") {
        return { ok: false, reason: "not_paid", retry: false };
      }
      if (!amountsMatch(expected, session.amount_total, session.currency)) {
        return { ok: false, reason: "amount_mismatch", retry: false, activate: false };
      }
      if (!metadata.job_id || !metadata.user_id) {
        return { ok: false, reason: "missing_job", retry: false };
      }
      return {
        ok: true,
        retry: false,
        action: "activate_ordinary_job",
        jobId: metadata.job_id,
        userId: metadata.user_id,
        plan: metadata.plan,
        amountCents: expected
      };
    }

    if (purpose === "job_subscription") {
      const plan = companyPlan(metadata.plan_code);
      if (session.mode !== "subscription" || session.payment_status !== "paid") {
        return { ok: false, reason: "not_paid", retry: false, activate: false };
      }
      if (!plan || !amountsMatch(plan.cents, session.amount_total, session.currency)) {
        return { ok: false, reason: "amount_mismatch", retry: false, activate: false };
      }
      if (!metadata.company_id || !session.subscription) {
        return { ok: false, reason: "missing_subscription", retry: false };
      }
      return {
        ok: true,
        retry: false,
        action: "record_subscription_checkout",
        activateJobs: false,
        companyId: metadata.company_id,
        planCode: metadata.plan_code,
        subscriptionId: session.subscription,
        amountCents: plan.cents
      };
    }

    return { ok: false, reason: "ignored", retry: false };
  }

  function decideBillingEvent(event) {
    const type = event && event.type;
    const object = event && event.data && event.data.object || {};

    if (type === "invoice.paid") {
      return {
        ok: true,
        action: "subscription_paid",
        deleteAdvertisements: false,
        subscriptionId: object.subscription || null,
        amountCents: object.amount_paid,
        currency: object.currency
      };
    }

    if (type === "invoice.payment_failed") {
      return {
        ok: true,
        action: "subscription_past_due",
        deleteAdvertisements: false,
        hideFromPublicSearch: true,
        subscriptionId: object.subscription || null
      };
    }

    if (type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
      const cents = object.items &&
        object.items.data &&
        object.items.data[0] &&
        object.items.data[0].price &&
        object.items.data[0].price.unit_amount;
      const mapped = planCodeFromCents(cents);
      const status = type === "customer.subscription.deleted"
        ? "canceled"
        : object.status;
      return {
        ok: true,
        action: "sync_subscription",
        deleteAdvertisements: false,
        hideFromPublicSearch: status !== "active",
        subscriptionId: object.id || null,
        status: status || "needs_review",
        cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
        currentPeriodEnd: object.current_period_end
          ? new Date(object.current_period_end * 1000).toISOString()
          : null,
        planCode: mapped,
        needsReview: type !== "customer.subscription.deleted" && !mapped
      };
    }

    if (type === "charge.refunded") {
      return {
        ok: true,
        action: "refund_ordinary_job",
        deleteAdvertisements: false,
        paymentIntent: object.payment_intent || null
      };
    }

    return { ok: false, reason: "ignored", retry: false };
  }

  function eventClaimDecision(existingOutcome) {
    if (!existingOutcome) {
      return { proceed: true, duplicate: false };
    }
    if (existingOutcome === "processing") {
      return { proceed: true, duplicate: false, resume: true };
    }
    return { proceed: false, duplicate: true };
  }

  function safeStripeId(value) {
    const text = String(value || "");
    if (!/^[A-Za-z0-9_]+$/.test(text)) return null;
    return text;
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

  async function recordEvent(supabase, event, outcome) {
    const inserted = await supabase
      .from("job_payment_events")
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        outcome: outcome
      })
      .select("stripe_event_id")
      .maybeSingle();

    if (inserted.error && isUniqueViolation(inserted.error)) {
      const existing = await supabase
        .from("job_payment_events")
        .select("outcome")
        .eq("stripe_event_id", event.id)
        .maybeSingle();
      if (existing.error || !existing.data) {
        return { ok: false, retry: true, reason: "event_lookup_failed" };
      }
      const claim = eventClaimDecision(existing.data.outcome);
      if (claim.duplicate) {
        return { duplicate: true };
      }
      return { duplicate: false, resume: true };
    }

    if (inserted.error) {
      return {
        ok: false,
        retry: isMissingRelation(inserted.error),
        reason: isMissingRelation(inserted.error) ? "schema_not_ready" : "event_record_failed"
      };
    }

    return { duplicate: false };
  }

  async function applyVerifiedCheckoutSession(input) {
    const supabase = input && input.supabase;
    const event = input && input.event;
    const session = input && input.session;

    if (!supabase || !event || !event.id || !session) {
      return { ok: false, retry: false, reason: "invalid_event" };
    }

    const decision = decideCheckoutSession(session);
    if (!decision.ok) {
      return decision;
    }

    const recorded = await recordEvent(supabase, event, "processing");
    if (recorded.duplicate) {
      return { ok: true, duplicate: true, retry: false };
    }
    if (recorded.ok === false) {
      return recorded;
    }

    if (decision.action === "activate_ordinary_job") {
      const existing = await supabase
        .from("jobs")
        .select("id,user_id,status,plan,expires_at,employer_kind,last_stripe_session_id")
        .eq("id", decision.jobId)
        .eq("user_id", decision.userId)
        .maybeSingle();

      if (existing.error) {
        return { ok: false, retry: true, reason: "job_lookup_failed" };
      }

      const job = existing.data;
      const sessionId = safeStripeId(session.id);
      if (!sessionId) {
        await supabase.from("job_payment_events").update({ outcome: "rejected" }).eq("stripe_event_id", event.id);
        return { ok: false, retry: false, reason: "invalid_session", activate: false };
      }

      if (job && job.last_stripe_session_id === sessionId) {
        await supabase.from("job_payment_events").update({
          outcome: "activated",
          job_id: job.id,
          stripe_session_id: sessionId,
          stripe_payment_intent: session.payment_intent || null
        }).eq("stripe_event_id", event.id);
        return { ok: true, duplicate: true, retry: false, activated: true };
      }

      if (!job || job.employer_kind === "company" || job.plan !== decision.plan) {
        await supabase.from("job_payment_events").update({ outcome: "rejected" }).eq("stripe_event_id", event.id);
        return { ok: false, retry: false, reason: "job_not_eligible", activate: false };
      }

      if (job.status === "active" && job.expires_at) {
        const extension = nextOrdinaryExpiry(Date.now(), job.expires_at);
        if (!extension.ok) {
          await supabase.from("job_payment_events").update({ outcome: "rejected" }).eq("stripe_event_id", event.id);
          return { ok: false, retry: false, reason: extension.reason, activate: false };
        }
      }

      const expiry = nextOrdinaryExpiry(Date.now(), job.status === "active" ? job.expires_at : null);
      if (!expiry.ok) {
        return { ok: false, retry: false, reason: expiry.reason, activate: false };
      }

      const updated = await supabase
        .from("jobs")
        .update({
          status: "active",
          expires_at: expiry.expiresAt,
          last_stripe_session_id: sessionId
        })
        .eq("id", job.id)
        .eq("user_id", job.user_id)
        .in("status", ["pending_payment", "active"])
        .or("last_stripe_session_id.is.null,last_stripe_session_id.neq." + sessionId)
        .select("id,status,expires_at");

      if (updated.error) {
        return { ok: false, retry: true, reason: "activation_failed" };
      }
      if (!updated.data || !updated.data.length) {
        const again = await supabase
          .from("jobs")
          .select("id,last_stripe_session_id")
          .eq("id", job.id)
          .maybeSingle();
        if (again.data && again.data.last_stripe_session_id === sessionId) {
          await supabase.from("job_payment_events").update({
            outcome: "activated",
            job_id: job.id,
            stripe_session_id: sessionId
          }).eq("stripe_event_id", event.id);
          return { ok: true, duplicate: true, retry: false, activated: true };
        }
        return { ok: false, retry: true, reason: "activation_failed" };
      }

      await supabase.from("job_payment_events").update({
        outcome: "activated",
        job_id: job.id,
        stripe_session_id: sessionId,
        stripe_payment_intent: session.payment_intent || null
      }).eq("stripe_event_id", event.id);

      return { ok: true, duplicate: false, retry: false, activated: true };
    }

    if (decision.action === "record_subscription_checkout") {
      const saved = await supabase
        .from("job_subscriptions")
        .upsert({
          company_id: decision.companyId,
          stripe_subscription_id: decision.subscriptionId,
          plan_code: decision.planCode,
          status: "incomplete",
          active_advertisement_limit: COMPANY_PLANS[decision.planCode].activeAdvertisementLimit
        }, { onConflict: "stripe_subscription_id" })
        .select("id,status");

      if (saved.error) {
        return { ok: false, retry: isMissingRelation(saved.error), reason: "subscription_record_failed" };
      }

      await supabase.from("job_payment_events").update({ outcome: "subscription_recorded" }).eq("stripe_event_id", event.id);
      return { ok: true, duplicate: false, activateJobs: false };
    }

    return { ok: false, retry: false, reason: "ignored" };
  }

  async function applyVerifiedBillingEvent(input) {
    const supabase = input && input.supabase;
    const event = input && input.event;
    if (!supabase || !event || !isJobBillingEvent(event) || event.type === "checkout.session.completed") {
      return { ok: false, retry: false, reason: "ignored" };
    }

    const decision = decideBillingEvent(event);
    if (!decision.ok) {
      return decision;
    }

    const recorded = await recordEvent(supabase, event, "processing");
    if (recorded.duplicate) {
      return { ok: true, duplicate: true, retry: false };
    }
    if (recorded.ok === false) {
      return recorded;
    }

    if (!decision.subscriptionId && decision.action !== "refund_ordinary_job") {
      await supabase.from("job_payment_events").update({ outcome: "ignored" }).eq("stripe_event_id", event.id);
      return { ok: true, retry: false, reason: "missing_subscription" };
    }

    if (decision.action === "subscription_past_due") {
      const updated = await supabase
        .from("job_subscriptions")
        .update({ status: "past_due" })
        .eq("stripe_subscription_id", decision.subscriptionId)
        .select("id");
      if (updated.error) {
        return { ok: false, retry: true, reason: "subscription_update_failed" };
      }
      await supabase.from("job_payment_events").update({ outcome: "past_due" }).eq("stripe_event_id", event.id);
      return { ok: true, deleteAdvertisements: false, hideFromPublicSearch: true };
    }

    if (decision.action === "subscription_paid") {
      const current = await supabase
        .from("job_subscriptions")
        .select("plan_code")
        .eq("stripe_subscription_id", decision.subscriptionId)
        .maybeSingle();
      const plan = companyPlan(current.data && current.data.plan_code);
      if (current.error || !plan || !amountsMatch(plan.cents, decision.amountCents, decision.currency)) {
        await supabase
          .from("job_subscriptions")
          .update({ status: "needs_review" })
          .eq("stripe_subscription_id", decision.subscriptionId);
        await supabase.from("job_payment_events").update({ outcome: "needs_review" }).eq("stripe_event_id", event.id);
        return { ok: true, retry: false, activated: false, reason: "amount_mismatch" };
      }
    }

    if (decision.action === "subscription_paid" || decision.action === "sync_subscription") {
      const patch = {
        status: decision.action === "subscription_paid" ? "active" : (decision.needsReview ? "needs_review" : decision.status)
      };
      if (decision.planCode) {
        patch.plan_code = decision.planCode;
        patch.active_advertisement_limit = COMPANY_PLANS[decision.planCode].activeAdvertisementLimit;
      }
      if (decision.currentPeriodEnd) {
        patch.current_period_end = decision.currentPeriodEnd;
      }
      if (Object.prototype.hasOwnProperty.call(decision, "cancelAtPeriodEnd")) {
        patch.cancel_at_period_end = decision.cancelAtPeriodEnd;
      }
      const updated = await supabase
        .from("job_subscriptions")
        .update(patch)
        .eq("stripe_subscription_id", decision.subscriptionId)
        .select("id,company_id,status,current_period_end");
      if (updated.error) {
        return { ok: false, retry: true, reason: "subscription_update_failed" };
      }
      const row = updated.data && updated.data[0];
      if (row && row.status === "active" && row.current_period_end) {
        await supabase
          .from("jobs")
          .update({ expires_at: row.current_period_end })
          .eq("company_id", row.company_id)
          .eq("employer_kind", "company")
          .eq("status", "active");
      }
      await supabase.from("job_payment_events").update({ outcome: patch.status }).eq("stripe_event_id", event.id);
      return { ok: true, deleteAdvertisements: false };
    }

    if (decision.action === "refund_ordinary_job") {
      if (!decision.paymentIntent) {
        return { ok: true, retry: false, reason: "missing_payment_intent" };
      }
      const payment = await supabase
        .from("job_payment_events")
        .select("job_id,stripe_payment_intent")
        .eq("stripe_payment_intent", decision.paymentIntent)
        .eq("outcome", "activated")
        .maybeSingle();
      if (payment.error || !payment.data || !payment.data.job_id) {
        await supabase.from("job_payment_events").update({ outcome: "refund_unmatched" }).eq("stripe_event_id", event.id);
        return { ok: true, retry: false, reason: "refund_unmatched" };
      }
      await supabase
        .from("jobs")
        .update({ status: "refunded" })
        .eq("id", payment.data.job_id)
        .eq("status", "active");
      await supabase.from("job_payment_events").update({ outcome: "refunded" }).eq("stripe_event_id", event.id);
      return { ok: true, deleteAdvertisements: false };
    }

    return { ok: false, retry: false, reason: "ignored" };
  }

  return {
    ADVERTISEMENT_DAYS: ADVERTISEMENT_DAYS,
    ORDINARY_PLANS: ORDINARY_PLANS,
    COMPANY_PLANS: COMPANY_PLANS,
    FAILURE_POLICY: FAILURE_POLICY,
    paymentsEnabled: paymentsEnabled,
    ordinaryAmountCents: ordinaryAmountCents,
    companyPlan: companyPlan,
    withinAdvertisementLimit: withinAdvertisementLimit,
    subscriptionAllowsPublicAds: subscriptionAllowsPublicAds,
    nextOrdinaryExpiry: nextOrdinaryExpiry,
    jobCheckoutDecision: jobCheckoutDecision,
    isJobBillingEvent: isJobBillingEvent,
    decideCheckoutSession: decideCheckoutSession,
    decideBillingEvent: decideBillingEvent,
    eventClaimDecision: eventClaimDecision,
    planCodeFromCents: planCodeFromCents,
    applyVerifiedCheckoutSession: applyVerifiedCheckoutSession,
    applyVerifiedBillingEvent: applyVerifiedBillingEvent
  };

});
