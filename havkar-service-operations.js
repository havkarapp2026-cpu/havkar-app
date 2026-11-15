/*
 * HAVKAR Services operations: availability, milestones, invoices,
 * verified reviews and disputes. Does not collect live payments.
 * Commission remains provider-only 1000 bps via existing commerce rules.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.HAVKAR_SERVICE_OPERATIONS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const COMMISSION_BPS = 1000;

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function oneRow(data) {
    if (Array.isArray(data)) return data.length === 1 ? data[0] : null;
    if (data && typeof data === "object" && data.id != null) return data;
    return null;
  }

  function confirmed(result) {
    if (!result || result.error) {
      return {
        ok: false,
        reason: "rejected",
        message: (result && result.error && result.error.message) || "Rejected."
      };
    }
    const row = oneRow(result.data);
    if (!row) {
      return { ok: false, reason: "not_confirmed", message: "Not confirmed." };
    }
    return { ok: true, row: row };
  }

  function invoiceFromBooking(booking, options) {
    const source = booking || {};
    const settings = options || {};
    const agreed = Number(source.agreed_price);
    if (!Number.isFinite(agreed) || agreed < 0) {
      return { ok: false, reason: "invalid_price" };
    }
    const cents = Math.round(agreed * 100);
    const commissionCents = Math.round((cents * COMMISSION_BPS) / 10000);
    return {
      ok: true,
      invoice: {
        booking_id: source.id,
        customer_id: source.customer_id,
        provider_id: source.provider_id,
        currency: clean(source.currency || "EUR").toUpperCase(),
        customer_total_cents: cents,
        provider_commission_bps: COMMISSION_BPS,
        provider_commission_cents: commissionCents,
        provider_settlement_cents: cents - commissionCents,
        status: settings.status || "issued",
        payment_method: clean(source.payment_method || "unset"),
        collection_state: settings.collection_state || "uncollected",
        note:
          "Receipt/invoice record only. Live charging stays OFF until Owner authorization."
      }
    };
  }

  function validateMilestone(input) {
    const title = clean(input && input.title);
    const amount = Number(input && input.amount);
    if (title.length < 2 || title.length > 120) {
      return { ok: false, reason: "invalid_title" };
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, reason: "invalid_amount" };
    }
    return {
      ok: true,
      value: {
        title: title,
        amount: amount,
        status: "pending"
      }
    };
  }

  function validateAvailabilitySlot(input) {
    const date = clean(input && input.slot_date);
    const start = clean(input && input.start_time);
    const end = clean(input && input.end_time);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, reason: "invalid_date" };
    }
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
      return { ok: false, reason: "invalid_time" };
    }
    if (start >= end) {
      return { ok: false, reason: "invalid_range" };
    }
    return {
      ok: true,
      value: {
        slot_date: date,
        start_time: start,
        end_time: end,
        is_available: input && input.is_available === false ? false : true
      }
    };
  }

  function validateReview(input) {
    const rating = Number(input && input.rating);
    const text = clean(input && input.review_text);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return { ok: false, reason: "invalid_rating" };
    }
    if (text.length < 5 || text.length > 1000) {
      return { ok: false, reason: "invalid_text" };
    }
    return {
      ok: true,
      value: {
        rating: rating,
        review_text: text,
        status: "published"
      }
    };
  }

  function validateDispute(input) {
    const category = clean(input && input.category);
    const details = clean(input && input.details);
    const allowed = [
      "service_not_completed",
      "poor_service_quality",
      "incorrect_price",
      "payment_disagreement",
      "provider_did_not_arrive",
      "customer_did_not_pay",
      "refund_request",
      "other"
    ];
    if (allowed.indexOf(category) === -1) {
      return { ok: false, reason: "invalid_category" };
    }
    if (details.length < 10 || details.length > 3000) {
      return { ok: false, reason: "invalid_details" };
    }
    return {
      ok: true,
      value: {
        category: category,
        details: details,
        status: "submitted"
      }
    };
  }

  async function issueInvoice(client, booking, options) {
    const built = invoiceFromBooking(booking, options);
    if (!built.ok) return built;
    if (!client) return { ok: true, invoice: built.invoice, persisted: false };
    const result = await client
      .from("service_invoices")
      .insert(built.invoice)
      .select("*")
      .single();
    const saved = confirmed(result);
    if (!saved.ok) return saved;
    return { ok: true, invoice: saved.row, persisted: true };
  }

  async function createMilestone(client, input) {
    const source = input || {};
    const validated = validateMilestone(source);
    if (!validated.ok) return validated;
    if (!client) return { ok: true, milestone: validated.value, persisted: false };
    const result = await client
      .from("service_milestones")
      .insert({
        booking_id: source.bookingId,
        title: validated.value.title,
        amount: validated.value.amount,
        status: "pending"
      })
      .select("*")
      .single();
    return confirmed(result);
  }

  async function upsertAvailability(client, input) {
    const source = input || {};
    const validated = validateAvailabilitySlot(source);
    if (!validated.ok) return validated;
    if (!client) return { ok: true, slot: validated.value, persisted: false };
    const result = await client
      .from("service_availability")
      .insert({
        provider_id: source.providerId,
        service_id: source.serviceId || null,
        slot_date: validated.value.slot_date,
        start_time: validated.value.start_time,
        end_time: validated.value.end_time,
        is_available: validated.value.is_available
      })
      .select("*")
      .single();
    return confirmed(result);
  }

  async function createVerifiedReview(client, input) {
    const source = input || {};
    const validated = validateReview(source);
    if (!validated.ok) return validated;
    if (!source.bookingId || !source.customerId || !source.providerId) {
      return { ok: false, reason: "missing" };
    }
    if (!client) {
      return {
        ok: true,
        review: Object.assign(
          {
            booking_id: source.bookingId,
            customer_id: source.customerId,
            provider_id: source.providerId
          },
          validated.value
        ),
        persisted: false
      };
    }
    const booking = await client
      .from("service_bookings")
      .select("id,status,customer_id,provider_id")
      .eq("id", source.bookingId)
      .eq("customer_id", source.customerId)
      .maybeSingle();
    if (!booking || booking.error || !booking.data || booking.data.status !== "completed") {
      return {
        ok: false,
        reason: "not_completed",
        message: "Reviews are allowed only after a completed booking."
      };
    }
    const result = await client
      .from("service_reviews")
      .insert({
        booking_id: source.bookingId,
        customer_id: source.customerId,
        provider_id: source.providerId,
        rating: validated.value.rating,
        review_text: validated.value.review_text,
        status: "published"
      })
      .select("*")
      .single();
    return confirmed(result);
  }

  async function openDispute(client, input) {
    const source = input || {};
    const validated = validateDispute(source);
    if (!validated.ok) return validated;
    if (!client) {
      return {
        ok: true,
        dispute: Object.assign({ booking_id: source.bookingId }, validated.value),
        persisted: false
      };
    }
    const result = await client
      .from("service_complaints")
      .insert({
        booking_id: source.bookingId,
        author_id: source.userId,
        category: validated.value.category,
        explanation: validated.value.details,
        status: "submitted"
      })
      .select("*")
      .single();
    return confirmed(result);
  }

  return {
    COMMISSION_BPS: COMMISSION_BPS,
    invoiceFromBooking: invoiceFromBooking,
    validateMilestone: validateMilestone,
    validateAvailabilitySlot: validateAvailabilitySlot,
    validateReview: validateReview,
    validateDispute: validateDispute,
    issueInvoice: issueInvoice,
    createMilestone: createMilestone,
    upsertAvailability: upsertAvailability,
    createVerifiedReview: createVerifiedReview,
    openDispute: openDispute
  };
});
