/*
 * Services 10% commission accounting semantics.
 * Cash/manual receivables must never be reported as Stripe-collected funds.
 */

const COLLECTION_STATES = Object.freeze({
  UNCOLLECTED: "uncollected",
  COLLECTED_CASH: "collected_cash",
  COLLECTED_STRIPE: "collected_stripe",
  VOID: "void"
});

function classifyCommissionRow(row = {}) {
  const collection = String(row.collection_state || COLLECTION_STATES.UNCOLLECTED);
  const channel = String(row.settlement_channel || "manual");
  const stripeEventId = row.stripe_event_id ? String(row.stripe_event_id) : "";
  const isStripeCollected =
    collection === COLLECTION_STATES.COLLECTED_STRIPE ||
    (Boolean(stripeEventId) && collection !== COLLECTION_STATES.UNCOLLECTED && channel === "stripe");
  const isCashReceivable =
    collection === COLLECTION_STATES.UNCOLLECTED ||
    collection === COLLECTION_STATES.COLLECTED_CASH ||
    (channel === "manual" && !isStripeCollected);

  return {
    collection_state: collection,
    settlement_channel: channel,
    stripe_event_id_present: Boolean(stripeEventId),
    counts_as_stripe_balance: isStripeCollected,
    counts_as_cash_receivable: isCashReceivable && !isStripeCollected,
    report_label: isStripeCollected
      ? "stripe_collected"
      : collection === COLLECTION_STATES.VOID
        ? "void"
        : "cash_or_uncollected_receivable"
  };
}

function summarizeCommissionLedger(rows = []) {
  let stripeCents = 0;
  let cashReceivableCents = 0;
  let uncollectedCents = 0;
  for (const row of rows) {
    const cents = Number(row.commission_cents) || 0;
    const cls = classifyCommissionRow(row);
    if (cls.counts_as_stripe_balance) {
      stripeCents += cents;
    } else if (row.collection_state === COLLECTION_STATES.UNCOLLECTED) {
      uncollectedCents += cents;
      cashReceivableCents += cents;
    } else if (cls.counts_as_cash_receivable) {
      cashReceivableCents += cents;
    }
  }
  return {
    stripe_collected_cents: stripeCents,
    cash_receivable_cents: cashReceivableCents,
    uncollected_cents: uncollectedCents,
    warning:
      "Never present cash_receivable_cents or uncollected_cents as money already in the HAVKAR Stripe balance."
  };
}

module.exports = {
  COLLECTION_STATES,
  classifyCommissionRow,
  summarizeCommissionLedger
};
