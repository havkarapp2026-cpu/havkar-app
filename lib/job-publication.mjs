/*
 * Server-side rules for publishing a HAVKAR job.
 * Prices are the amounts already shown in jobs.html and havkar-jobs.js.
 * The publication currency is EUR because those prices are shown in euros
 * and the existing Stripe Checkout integration charges EUR.
 * jobs.currency is the salary currency and is not used here.
 */

export const JOB_PUBLICATION_PLANS = {
  Basic: { amount: "9.99", cents: 999 },
  Professional: { amount: "19.99", cents: 1999 },
  Business: { amount: "39.99", cents: 3999 },
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function centsFromMoney(value) {
  const text = String(value ?? "").trim();

  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return null;
  }

  const parts = text.split(".");
  const whole = Number(parts[0]);
  const fraction = Number((parts[1] || "").padEnd(2, "0"));

  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(fraction)) {
    return null;
  }

  return whole * 100 + fraction;
}

export function planForStoredJob(planName, monthlyFee) {
  const plan = JOB_PUBLICATION_PLANS[planName];

  if (!plan) {
    return null;
  }

  if (centsFromMoney(monthlyFee) !== plan.cents) {
    return null;
  }

  return plan;
}

export function checkoutReuseAction(session) {
  if (!session || typeof session !== "object") {
    return "replace";
  }

  if (session.status === "complete" && session.payment_status === "paid") {
    return "confirm";
  }

  if (session.status === "open" && isStripeCheckoutUrl(session.url)) {
    return "reuse";
  }

  return "replace";
}

export function unpaidJobOutcome(eventType) {
  if (eventType === "checkout.session.expired") {
    return "expired";
  }

  if (eventType === "checkout.session.async_payment_failed") {
    return "failed";
  }

  return null;
}

export function isStripeCheckoutUrl(value) {
  let url;

  try {
    url = new URL(String(value || ""));
  } catch (error) {
    return false;
  }

  return (
    url.protocol === "https:" &&
    (url.hostname === "checkout.stripe.com" ||
      url.hostname.endsWith(".stripe.com"))
  );
}

export function assessRecordableJobSession(session) {
  if (!session || typeof session !== "object") {
    return { ok: false, reason: "missing_session" };
  }

  return assessPaidJobSession({
    ...session,
    payment_status: "paid",
  });
}

export function assessPaidJobSession(session) {
  if (!session || typeof session !== "object") {
    return { ok: false, reason: "missing_session" };
  }

  if (session.mode !== "payment") {
    return { ok: false, reason: "mode" };
  }

  if (session.payment_status !== "paid") {
    return { ok: false, reason: "unpaid" };
  }

  const metadata = session.metadata || {};

  if (metadata.event_ticket_id) {
    return { ok: false, reason: "ticket_metadata" };
  }

  if (metadata.purpose !== "job_publication") {
    return { ok: false, reason: "purpose" };
  }

  const plan = JOB_PUBLICATION_PLANS[metadata.plan];

  if (!plan) {
    return { ok: false, reason: "plan" };
  }

  const jobId = Number(metadata.job_id);

  if (!Number.isSafeInteger(jobId) || jobId <= 0) {
    return { ok: false, reason: "job" };
  }

  const userId = String(metadata.havkar_user_id || "");

  if (!UUID_PATTERN.test(userId)) {
    return { ok: false, reason: "user" };
  }

  if (String(session.currency || "").toLowerCase() !== "eur") {
    return { ok: false, reason: "currency" };
  }

  if (session.amount_total !== plan.cents) {
    return { ok: false, reason: "amount" };
  }

  const sessionId = String(session.id || "");

  if (!sessionId.startsWith("cs_")) {
    return { ok: false, reason: "session" };
  }

  return {
    ok: true,
    jobId: jobId,
    userId: userId,
    plan: metadata.plan,
    amount: plan.amount,
    currency: "EUR",
    sessionId: sessionId,
  };
}
