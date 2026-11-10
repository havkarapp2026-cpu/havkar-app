/*
 * Stripe webhook event claim helper.
 * Prefer durable unique stripe_event_id rows; degrade safely if the
 * migration table is not applied yet (still process, no hard fail).
 */

function isStripeEventId(value) {
  return /^evt_[A-Za-z0-9]+$/.test(String(value || "").trim());
}

function claimRowFromEvent(event) {
  const stripeEventId = String(event && event.id ? event.id : "").trim();
  return {
    stripe_event_id: stripeEventId,
    event_type: String((event && event.type) || "").slice(0, 120),
    livemode: Boolean(event && event.livemode),
    object_id: String(
      (event &&
        event.data &&
        event.data.object &&
        (event.data.object.id || "")) ||
        ""
    ).slice(0, 128),
    received_at: new Date().toISOString()
  };
}

/**
 * @returns {Promise<{
 *   ok: boolean,
 *   duplicate?: boolean,
 *   durable?: boolean,
 *   warning?: string,
 *   error?: object
 * }>}
 */
async function claimStripeWebhookEvent(supabase, event) {
  const row = claimRowFromEvent(event);
  if (!isStripeEventId(row.stripe_event_id)) {
    return { ok: true, duplicate: false, durable: false, warning: "missing_event_id" };
  }

  if (!supabase || typeof supabase.from !== "function") {
    return { ok: true, duplicate: false, durable: false, warning: "no_supabase" };
  }

  const { error } = await supabase.from("stripe_webhook_events").insert(row);

  if (!error) {
    return { ok: true, duplicate: false, durable: true };
  }

  const code = String(error.code || "");
  const message = String(error.message || "");

  // unique_violation — already processed
  if (code === "23505" || /duplicate key/i.test(message)) {
    return { ok: true, duplicate: true, durable: true };
  }

  // undefined_table — migration not applied yet
  if (
    code === "42P01" ||
    /relation .*stripe_webhook_events.* does not exist/i.test(message) ||
    /Could not find the table/i.test(message)
  ) {
    return {
      ok: true,
      duplicate: false,
      durable: false,
      warning: "table_missing"
    };
  }

  return { ok: false, error };
}

function ownerEur1Response(session, extras) {
  return {
    received: true,
    owner_micro_test: true,
    payment_status: (session && session.payment_status) || null,
    session_id: (session && session.id) || null,
    ...(extras || {})
  };
}

function isOwnerEur1Session(session) {
  return String((session && session.metadata && session.metadata.havkar_owner_micro_test) || "") === "true";
}

module.exports = {
  isStripeEventId,
  claimRowFromEvent,
  claimStripeWebhookEvent,
  ownerEur1Response,
  isOwnerEur1Session
};
