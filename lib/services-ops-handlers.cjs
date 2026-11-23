/**
 * Services ops API handlers (availability, messages, credentials, staff panel,
 * connect countries, refund prepare/approve/execute gate, invoices/milestones).
 */
"use strict";

const ops = require("./services-global-ops.cjs");

const SERVICES_OPS_ACTIONS = [
  "services_connect_countries",
  "services_availability_list",
  "services_availability_upsert",
  "services_availability_delete",
  "services_holiday_upsert",
  "services_holiday_delete",
  "services_slot_check",
  "services_booking_messages_list",
  "services_booking_message_send",
  "services_credential_submit",
  "services_credential_review",
  "services_credentials_list",
  "services_staff_panel",
  "services_invoice_ensure",
  "services_milestones_list",
  "services_milestone_upsert",
  "services_refund_request",
  "services_refund_approve",
  "services_refund_execute",
  "services_reschedule_booking"
];

function isServicesOpsAction(action) {
  return SERVICES_OPS_ACTIONS.includes(String(action || ""));
}

async function resolveStaffRole(supabase, userId) {
  try {
    const { data, error } = await supabase.rpc("havkar_user_ops_role", {
      target_user: userId
    });
    if (!error && data) return String(data);
  } catch (_e) {
    /* optional RPC */
  }
  return null;
}

async function assertStaffOrOwner(ctx, userId) {
  if (await ctx.isPrimaryHavkarOwner(userId)) return { ok: true, role: "owner" };
  const role = await resolveStaffRole(ctx.supabase, userId);
  if (role && ["staff", "admin", "support", "owner"].includes(role)) {
    return { ok: true, role };
  }
  return { ok: false, role: role || "user" };
}

async function loadBookingParty(supabase, bookingId) {
  const { data, error } = await supabase
    .from("service_bookings")
    .select(
      "id,customer_id,provider_id,service_id,status,payment_method,agreed_price,currency,booking_date,booking_time,stripe_payment_intent,stripe_charge_id,commission_amount"
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function notifyUser(supabase, userId, payload) {
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      type: payload.type || "services",
      title: payload.title || "HAVKAR Services",
      message: payload.message || "",
      is_read: false,
      action_url: payload.action_url || "/services.html#bookings",
      reference_id: payload.reference_id || null,
      metadata: payload.metadata || {}
    });
    return true;
  } catch (_e) {
    return false;
  }
}

async function ensureInvoiceForBooking(supabase, booking, note) {
  const agreedCents = Math.round(Number(booking.agreed_price) * 100);
  if (!Number.isInteger(agreedCents) || agreedCents < 0) {
    return { ok: false, error: "invalid_price" };
  }
  const commission = Math.round((agreedCents * 1000) / 10000);
  const settlement = agreedCents - commission;
  const { data: existing } = await supabase
    .from("service_invoices")
    .select("id,status,collection_state")
    .eq("booking_id", booking.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing && existing.id) {
    return { ok: true, invoice: existing, created: false };
  }
  const collection =
    booking.payment_method === "online" && booking.stripe_payment_intent
      ? "collected_stripe"
      : "uncollected";
  const status =
    booking.status === "refunded"
      ? "refunded"
      : booking.stripe_payment_intent
        ? "paid"
        : "issued";
  const { data, error } = await supabase
    .from("service_invoices")
    .insert({
      booking_id: booking.id,
      customer_id: booking.customer_id,
      provider_id: booking.provider_id,
      currency: booking.currency || "EUR",
      customer_total_cents: agreedCents,
      provider_commission_bps: 1000,
      provider_commission_cents: commission,
      provider_settlement_cents: settlement,
      status,
      payment_method: booking.payment_method || "unset",
      collection_state: collection,
      note: note || null
    })
    .select("id,booking_id,status,collection_state,customer_total_cents")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, invoice: data, created: true };
}

async function handleServicesOpsAction(ctx) {
  const {
    action,
    req,
    res,
    auth,
    supabase,
    sendError,
    isPrimaryHavkarOwner,
    serviceCommerce,
    createMarketplaceConnectAccount,
    createRecipientAccountOnboardingLink,
    allowedCheckoutOrigin,
    getStripe
  } = ctx;

  if (action === "services_connect_countries") {
    return res.status(200).json({
      ok: true,
      countries: ops.STRIPE_CONNECT_EXPRESS_COUNTRIES,
      note:
        "Only these Stripe Connect countries are enabled for HAVKAR Services providers. Unsupported countries stay disabled."
    });
  }

  if (!auth || !auth.user) {
    return sendError(res, 401, "Authentication required");
  }
  const uid = String(auth.user.id);
  const body = req.body || {};

  if (action === "services_availability_list") {
    const providerId = String(body.provider_id || uid);
    const staff = await assertStaffOrOwner(ctx, uid);
    if (providerId !== uid && !staff.ok) {
      return sendError(
        res,
        403,
        "Availability calendar is private. Use services_slot_check for a specific booking time."
      );
    }
    const from = String(body.from_date || "").trim();
    const to = String(body.to_date || "").trim();
    let q = supabase
      .from("service_availability")
      .select(
        "id,provider_id,service_id,slot_date,start_time,end_time,is_available,timezone,notes"
      )
      .eq("provider_id", providerId)
      .order("slot_date")
      .limit(200);
    if (from) q = q.gte("slot_date", from);
    if (to) q = q.lte("slot_date", to);
    const { data, error } = await q;
    if (error) return sendError(res, 500, error.message);
    const { data: holidays } = await supabase
      .from("service_provider_holidays")
      .select("id,holiday_date,reason")
      .eq("provider_id", providerId)
      .order("holiday_date")
      .limit(100);
    return res.status(200).json({
      ok: true,
      availability: data || [],
      holidays: holidays || []
    });
  }

  if (action === "services_availability_upsert") {
    const slotDate = String(body.slot_date || "").trim();
    const startTime = String(body.start_time || "").trim();
    const endTime = String(body.end_time || "").trim();
    const timezone = String(body.timezone || "Europe/Rome").trim() || "Europe/Rome";
    if (!slotDate || !startTime || !endTime) {
      return sendError(res, 400, "slot_date, start_time, end_time required");
    }
    if (
      ops.timeToMinutes(startTime) == null ||
      ops.timeToMinutes(endTime) == null ||
      ops.timeToMinutes(endTime) <= ops.timeToMinutes(startTime)
    ) {
      return sendError(res, 400, "Invalid time range");
    }
    const row = {
      provider_id: uid,
      service_id: body.service_id ? Number(body.service_id) : null,
      slot_date: slotDate,
      start_time: startTime,
      end_time: endTime,
      is_available: body.is_available !== false,
      timezone,
      notes: body.notes ? String(body.notes).slice(0, 500) : null
    };
    let result;
    if (body.id) {
      result = await supabase
        .from("service_availability")
        .update(row)
        .eq("id", Number(body.id))
        .eq("provider_id", uid)
        .select("*")
        .maybeSingle();
    } else {
      result = await supabase
        .from("service_availability")
        .insert(row)
        .select("*")
        .maybeSingle();
    }
    if (result.error) return sendError(res, 500, result.error.message);
    await supabase
      .from("service_provider_profiles")
      .upsert(
        { user_id: uid, timezone, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    return res.status(200).json({ ok: true, slot: result.data });
  }

  if (action === "services_availability_delete") {
    const id = Number(body.id || 0);
    if (!id) return sendError(res, 400, "id required");
    const { error } = await supabase
      .from("service_availability")
      .delete()
      .eq("id", id)
      .eq("provider_id", uid);
    if (error) return sendError(res, 500, error.message);
    return res.status(200).json({ ok: true, deleted: id });
  }

  if (action === "services_holiday_upsert") {
    const holidayDate = String(body.holiday_date || "").trim();
    if (!holidayDate) return sendError(res, 400, "holiday_date required");
    const { data, error } = await supabase
      .from("service_provider_holidays")
      .upsert(
        {
          provider_id: uid,
          holiday_date: holidayDate,
          reason: body.reason ? String(body.reason).slice(0, 200) : null
        },
        { onConflict: "provider_id,holiday_date" }
      )
      .select("*")
      .maybeSingle();
    if (error) return sendError(res, 500, error.message);
    return res.status(200).json({ ok: true, holiday: data });
  }

  if (action === "services_holiday_delete") {
    const holidayDate = String(body.holiday_date || "").trim();
    if (!holidayDate) return sendError(res, 400, "holiday_date required");
    const { error } = await supabase
      .from("service_provider_holidays")
      .delete()
      .eq("provider_id", uid)
      .eq("holiday_date", holidayDate);
    if (error) return sendError(res, 500, error.message);
    return res.status(200).json({ ok: true });
  }

  if (action === "services_slot_check") {
    const providerId = String(body.provider_id || "").trim();
    const bookingDate = String(body.booking_date || "").trim();
    const bookingTime = String(body.booking_time || "").trim();
    if (!providerId || !bookingDate || !bookingTime) {
      return sendError(res, 400, "provider_id, booking_date, booking_time required");
    }
    const { data: holiday } = await supabase
      .from("service_provider_holidays")
      .select("id")
      .eq("provider_id", providerId)
      .eq("holiday_date", bookingDate)
      .maybeSingle();
    if (holiday && holiday.id) {
      return res.status(200).json({
        ok: true,
        bookable: false,
        reason: "provider_holiday"
      });
    }
    const { data: slots } = await supabase
      .from("service_availability")
      .select("id,start_time,end_time,is_available,timezone")
      .eq("provider_id", providerId)
      .eq("slot_date", bookingDate)
      .eq("is_available", true);
    const hasOpen = Array.isArray(slots) && slots.length > 0;
    const inWindow =
      !hasOpen ||
      slots.some((slot) =>
        ops.slotOverlaps(slot.start_time, slot.end_time, bookingTime)
      );
    const { data: conflict } = await supabase
      .from("service_bookings")
      .select("id")
      .eq("provider_id", providerId)
      .eq("booking_date", bookingDate)
      .eq("booking_time", bookingTime)
      .in("status", [
        "pending",
        "price_proposed",
        "accepted",
        "completion_requested",
        "completed",
        "in_review",
        "disputed"
      ])
      .limit(1)
      .maybeSingle();
    const bookable = inWindow && !(conflict && conflict.id);
    return res.status(200).json({
      ok: true,
      bookable,
      reason: !inWindow
        ? "outside_availability"
        : conflict && conflict.id
          ? "slot_taken"
          : null,
      timezone: (slots && slots[0] && slots[0].timezone) || null
    });
  }

  if (action === "services_booking_messages_list") {
    const bookingId = Number(body.booking_id || 0);
    const booking = await loadBookingParty(supabase, bookingId);
    if (!booking) return sendError(res, 404, "Booking not found");
    if (uid !== String(booking.customer_id) && uid !== String(booking.provider_id)) {
      const staff = await assertStaffOrOwner(ctx, uid);
      if (!staff.ok) return sendError(res, 403, "Not a party to this booking");
    }
    const { data, error } = await supabase
      .from("service_booking_messages")
      .select("id,booking_id,sender_id,body,created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) return sendError(res, 500, error.message);
    return res.status(200).json({ ok: true, messages: data || [] });
  }

  if (action === "services_booking_message_send") {
    const bookingId = Number(body.booking_id || 0);
    const text = String(body.body || "").trim();
    if (!bookingId || text.length < 1 || text.length > 2000) {
      return sendError(res, 400, "booking_id and body (1-2000) required");
    }
    const booking = await loadBookingParty(supabase, bookingId);
    if (!booking) return sendError(res, 404, "Booking not found");
    if (uid !== String(booking.customer_id) && uid !== String(booking.provider_id)) {
      return sendError(res, 403, "Only booking parties may message");
    }
    const { data, error } = await supabase
      .from("service_booking_messages")
      .insert({ booking_id: bookingId, sender_id: uid, body: text })
      .select("id,booking_id,sender_id,body,created_at")
      .maybeSingle();
    if (error) return sendError(res, 500, error.message);
    const peer =
      uid === String(booking.customer_id)
        ? booking.provider_id
        : booking.customer_id;
    await notifyUser(supabase, peer, {
      type: "services_booking_message",
      title: "New booking message",
      message: text.slice(0, 180),
      reference_id: String(bookingId),
      action_url: "/services.html#bookings",
      metadata: { booking_id: bookingId }
    });
    return res.status(200).json({ ok: true, message: data });
  }

  if (action === "services_credential_submit") {
    const category = String(body.category || "").trim();
    if (!category) return sendError(res, 400, "category required");
    if (!ops.categoryRequiresLicense(category) && body.force !== true) {
      return res.status(200).json({
        ok: true,
        required: false,
        note: "This category does not require a professional license review."
      });
    }
    const evidence = String(body.evidence_path || "").trim();
    if (!evidence || !/^https:\/\//i.test(evidence)) {
      return sendError(
        res,
        400,
        "evidence_path must be an https URL to uploaded proof (no unverified badge)."
      );
    }
    const { data, error } = await supabase
      .from("service_provider_credential_reviews")
      .insert({
        provider_id: uid,
        category,
        license_number: body.license_number
          ? String(body.license_number).slice(0, 80)
          : null,
        jurisdiction: body.jurisdiction
          ? String(body.jurisdiction).slice(0, 80)
          : null,
        evidence_path: evidence.slice(0, 500),
        status: "pending",
        expires_at: body.expires_at || null
      })
      .select("*")
      .maybeSingle();
    if (error) return sendError(res, 500, error.message);
    await supabase
      .from("service_provider_profiles")
      .upsert(
        {
          user_id: uid,
          verification_status: "pending",
          credentials: category,
          license_evidence_path: evidence.slice(0, 500),
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      );
    return res.status(200).json({
      ok: true,
      review: data,
      note: "Submitted for Owner/staff review. Verified badge is not granted until approved."
    });
  }

  if (action === "services_credentials_list") {
    const staff = await assertStaffOrOwner(ctx, uid);
    const providerFilter = String(body.provider_id || "").trim();
    let q = supabase
      .from("service_provider_credential_reviews")
      .select(
        "id,provider_id,category,license_number,jurisdiction,evidence_path,status,expires_at,submitted_at,reviewed_at,review_notes"
      )
      .order("submitted_at", { ascending: false })
      .limit(100);
    if (staff.ok) {
      if (providerFilter) q = q.eq("provider_id", providerFilter);
      if (body.status) q = q.eq("status", String(body.status));
    } else {
      q = q.eq("provider_id", uid);
    }
    const { data, error } = await q;
    if (error) return sendError(res, 500, error.message);
    return res.status(200).json({ ok: true, reviews: data || [], role: staff.role });
  }

  if (action === "services_credential_review") {
    const staff = await assertStaffOrOwner(ctx, uid);
    if (!staff.ok) return sendError(res, 403, "Staff or Owner role required");
    const reviewId = Number(body.review_id || 0);
    const next = String(body.status || "").toLowerCase();
    if (!reviewId || !["approved", "rejected", "expired"].includes(next)) {
      return sendError(res, 400, "review_id and status required");
    }
    const { data: existing } = await supabase
      .from("service_provider_credential_reviews")
      .select("*")
      .eq("id", reviewId)
      .maybeSingle();
    if (!existing) return sendError(res, 404, "Review not found");
    if (String(existing.provider_id) === uid) {
      return sendError(
        res,
        403,
        "Self-review is blocked. Another Owner/staff member must review credentials."
      );
    }
    const { data, error } = await supabase
      .from("service_provider_credential_reviews")
      .update({
        status: next,
        reviewer_id: uid,
        review_notes: body.review_notes
          ? String(body.review_notes).slice(0, 500)
          : null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", reviewId)
      .select("*")
      .maybeSingle();
    if (error) return sendError(res, 500, error.message);
    if (next === "approved") {
      await supabase
        .from("service_provider_profiles")
        .upsert(
          {
            user_id: existing.provider_id,
            verification_status: "verified",
            updated_at: new Date().toISOString()
          },
          { onConflict: "user_id" }
        );
    } else if (next === "rejected" || next === "expired") {
      await supabase
        .from("service_provider_profiles")
        .update({
          verification_status: next === "rejected" ? "rejected" : "unverified",
          updated_at: new Date().toISOString()
        })
        .eq("user_id", existing.provider_id);
    }
    await notifyUser(supabase, existing.provider_id, {
      type: "services_credential_review",
      title: "Credential review update",
      message: "Your professional credential was marked: " + next,
      reference_id: String(reviewId)
    });
    return res.status(200).json({ ok: true, review: data });
  }

  if (action === "services_staff_panel") {
    const staff = await assertStaffOrOwner(ctx, uid);
    if (!staff.ok) return sendError(res, 403, "Staff role required");
    const [complaints, credentials, bookings] = await Promise.all([
      supabase
        .from("service_complaints")
        .select("id,booking_id,author_id,category,explanation,status,created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("service_provider_credential_reviews")
        .select(
          "id,provider_id,category,status,submitted_at,expires_at,evidence_path"
        )
        .eq("status", "pending")
        .order("submitted_at", { ascending: false })
        .limit(50),
      supabase
        .from("service_bookings")
        .select("id,status,service_id,provider_id,customer_id,booking_date,created_at")
        .order("created_at", { ascending: false })
        .limit(50)
    ]);
    return res.status(200).json({
      ok: true,
      role: staff.role,
      finance_hidden: true,
      owner_vault_hidden: true,
      complaints: ops.staffServicesPanelSafe(complaints.data || []),
      credential_reviews: credentials.data || [],
      bookings: (bookings.data || []).map(function (b) {
        return {
          id: b.id,
          status: b.status,
          service_id: b.service_id,
          booking_date: b.booking_date,
          created_at: b.created_at
        };
      }),
      note:
        "Staff panel excludes commission ledgers, Stripe balances, Owner vault, and payout secrets."
    });
  }

  if (action === "services_invoice_ensure") {
    const bookingId = Number(body.booking_id || 0);
    const booking = await loadBookingParty(supabase, bookingId);
    if (!booking) return sendError(res, 404, "Booking not found");
    if (
      uid !== String(booking.customer_id) &&
      uid !== String(booking.provider_id) &&
      !(await isPrimaryHavkarOwner(uid))
    ) {
      return sendError(res, 403, "Not authorized");
    }
    const ensured = await ensureInvoiceForBooking(supabase, booking, body.note);
    if (!ensured.ok) return sendError(res, 500, ensured.error || "invoice failed");
    return res.status(200).json(ensured);
  }

  if (action === "services_milestones_list") {
    const bookingId = Number(body.booking_id || 0);
    const booking = await loadBookingParty(supabase, bookingId);
    if (!booking) return sendError(res, 404, "Booking not found");
    if (uid !== String(booking.customer_id) && uid !== String(booking.provider_id)) {
      return sendError(res, 403, "Not authorized");
    }
    const { data, error } = await supabase
      .from("service_milestones")
      .select("id,booking_id,title,amount,status,created_at,completed_at")
      .eq("booking_id", bookingId)
      .order("created_at");
    if (error) return sendError(res, 500, error.message);
    return res.status(200).json({ ok: true, milestones: data || [] });
  }

  if (action === "services_milestone_upsert") {
    const bookingId = Number(body.booking_id || 0);
    const booking = await loadBookingParty(supabase, bookingId);
    if (!booking) return sendError(res, 404, "Booking not found");
    if (uid !== String(booking.provider_id) && !(await isPrimaryHavkarOwner(uid))) {
      return sendError(res, 403, "Only provider may manage milestones");
    }
    const title = String(body.title || "").trim();
    const amount = Number(body.amount);
    if (!title || !Number.isFinite(amount) || amount < 0) {
      return sendError(res, 400, "title and amount required");
    }
    const status = String(body.status || "pending").toLowerCase();
    if (!["pending", "completed", "cancelled"].includes(status)) {
      return sendError(res, 400, "invalid milestone status");
    }
    let result;
    if (body.id) {
      result = await supabase
        .from("service_milestones")
        .update({
          title,
          amount,
          status,
          completed_at: status === "completed" ? new Date().toISOString() : null
        })
        .eq("id", Number(body.id))
        .eq("booking_id", bookingId)
        .select("*")
        .maybeSingle();
    } else {
      result = await supabase
        .from("service_milestones")
        .insert({
          booking_id: bookingId,
          title,
          amount,
          status,
          completed_at: status === "completed" ? new Date().toISOString() : null
        })
        .select("*")
        .maybeSingle();
    }
    if (result.error) return sendError(res, 500, result.error.message);
    await ensureInvoiceForBooking(supabase, booking, "milestone_sync");
    return res.status(200).json({ ok: true, milestone: result.data });
  }

  if (action === "services_reschedule_booking") {
    const bookingId = Number(body.booking_id || 0);
    const bookingDate = String(body.booking_date || "").trim();
    const bookingTime = String(body.booking_time || "").trim();
    const booking = await loadBookingParty(supabase, bookingId);
    if (!booking) return sendError(res, 404, "Booking not found");
    const isParty =
      uid === String(booking.customer_id) || uid === String(booking.provider_id);
    if (!isParty) return sendError(res, 403, "Not authorized");
    if (!["pending", "accepted", "price_proposed"].includes(String(booking.status))) {
      return sendError(res, 409, "Booking cannot be rescheduled in this status");
    }
    if (!bookingDate || !bookingTime) {
      return sendError(res, 400, "booking_date and booking_time required");
    }
    const { data: holiday } = await supabase
      .from("service_provider_holidays")
      .select("id")
      .eq("provider_id", booking.provider_id)
      .eq("holiday_date", bookingDate)
      .maybeSingle();
    if (holiday && holiday.id) {
      return sendError(res, 409, "Provider is unavailable on this holiday");
    }
    const { data: conflict } = await supabase
      .from("service_bookings")
      .select("id")
      .eq("provider_id", booking.provider_id)
      .eq("booking_date", bookingDate)
      .eq("booking_time", bookingTime)
      .neq("id", bookingId)
      .in("status", [
        "pending",
        "price_proposed",
        "accepted",
        "completion_requested",
        "completed",
        "in_review",
        "disputed"
      ])
      .limit(1)
      .maybeSingle();
    if (conflict && conflict.id) {
      return sendError(res, 409, "Target slot already booked");
    }
    const { data, error } = await supabase
      .from("service_bookings")
      .update({
        booking_date: bookingDate,
        booking_time: bookingTime,
        updated_at: new Date().toISOString()
      })
      .eq("id", bookingId)
      .select("id,booking_date,booking_time,status")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") {
        return sendError(res, 409, "Target slot already booked");
      }
      return sendError(res, 500, error.message);
    }
    const peer =
      uid === String(booking.customer_id)
        ? booking.provider_id
        : booking.customer_id;
    await notifyUser(supabase, peer, {
      type: "services_reschedule",
      title: "Booking rescheduled",
      message: "Booking #" + bookingId + " moved to " + bookingDate + " " + bookingTime,
      reference_id: String(bookingId)
    });
    return res.status(200).json({ ok: true, booking: data });
  }

  if (action === "services_refund_request") {
    const bookingId = Number(body.booking_id || 0);
    const booking = await loadBookingParty(supabase, bookingId);
    if (!booking) return sendError(res, 404, "Booking not found");
    const isOwner = await isPrimaryHavkarOwner(uid);
    if (
      !isOwner &&
      uid !== String(booking.customer_id) &&
      uid !== String(booking.provider_id)
    ) {
      return sendError(res, 403, "Not authorized");
    }
    if (!booking.stripe_payment_intent && !booking.stripe_charge_id) {
      return sendError(res, 409, "No Stripe charge to refund");
    }
    const agreedCents = serviceCommerce.priceToCents(booking.agreed_price);
    const split = serviceCommerce.settleProviderCommission(agreedCents);
    if (!split.ok) return sendError(res, 400, split.reason || "split failed");
    const refundCents =
      body.refund_cents != null
        ? Number(body.refund_cents)
        : split.settlement.customerChargeCents;
    const plan = ops.planServiceRefund({
      agreedCents: split.settlement.agreedCents,
      commissionCents: split.settlement.commissionCents,
      providerSettlementCents: split.settlement.providerSettlementCents,
      refundCents,
      currency: booking.currency
    });
    if (!plan.ok) return sendError(res, 400, plan.reason);
    const { data, error } = await supabase
      .from("service_refund_requests")
      .insert({
        booking_id: booking.id,
        requested_by: uid,
        refund_cents: plan.refund_cents,
        currency: plan.currency,
        reason: body.reason ? String(body.reason).slice(0, 500) : null,
        status: "prepared",
        plan
      })
      .select("*")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") {
        return sendError(res, 409, "An open refund request already exists");
      }
      return sendError(res, 500, error.message);
    }
    return res.status(200).json({
      ok: true,
      refund_executed: false,
      request: data,
      note: "Prepared only. Owner must approve, then execute. No money moved."
    });
  }

  if (action === "services_refund_approve") {
    if (!(await isPrimaryHavkarOwner(uid))) {
      return sendError(res, 403, "Owner approval required");
    }
    const requestId = Number(body.request_id || 0);
    if (!requestId) return sendError(res, 400, "request_id required");
    const { data, error } = await supabase
      .from("service_refund_requests")
      .update({
        status: "owner_approved",
        owner_approved_by: uid,
        owner_approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", requestId)
      .eq("status", "prepared")
      .select("*")
      .maybeSingle();
    if (error || !data) {
      return sendError(res, 409, (error && error.message) || "Approve failed");
    }
    return res.status(200).json({
      ok: true,
      refund_executed: false,
      request: data,
      note: "Owner approved. Call services_refund_execute with confirm_execute=true to move money."
    });
  }

  if (action === "services_refund_execute") {
    if (!(await isPrimaryHavkarOwner(uid))) {
      return sendError(res, 403, "Owner role required to execute refunds");
    }
    if (body.confirm_execute !== true) {
      return res.status(400).json({
        ok: false,
        refund_executed: false,
        code: "CONFIRM_REQUIRED",
        error:
          "Set confirm_execute=true after explicit Owner approval. No refund was executed."
      });
    }
    if (process.env.HAVKAR_SERVICES_REFUND_EXECUTE_ENABLED !== "true") {
      return res.status(503).json({
        ok: false,
        refund_executed: false,
        code: "EXECUTE_FLAG_OFF",
        error:
          "Refund execution flag is off. Approval can be recorded, but Stripe refunds stay blocked until Owner enables HAVKAR_SERVICES_REFUND_EXECUTE_ENABLED."
      });
    }
    const requestId = Number(body.request_id || 0);
    const { data: request } = await supabase
      .from("service_refund_requests")
      .select("*")
      .eq("id", requestId)
      .eq("status", "owner_approved")
      .maybeSingle();
    if (!request) {
      return sendError(res, 409, "Approved refund request not found");
    }
    const booking = await loadBookingParty(supabase, request.booking_id);
    if (!booking || !booking.stripe_payment_intent) {
      return sendError(res, 409, "Booking PaymentIntent missing");
    }
    const stripe = getStripe();
    const refund = await stripe.refunds.create(
      {
        payment_intent: booking.stripe_payment_intent,
        amount: request.refund_cents,
        reason: "requested_by_customer",
        metadata: {
          havkar_flow: "services",
          booking_id: String(booking.id),
          refund_request_id: String(request.id)
        }
      },
      { idempotencyKey: "services_refund_req_" + request.id }
    );
    await supabase
      .from("service_refund_requests")
      .update({
        status: "executed",
        stripe_refund_id: refund.id,
        executed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", request.id);
    await supabase
      .from("service_bookings")
      .update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", booking.id);
    await supabase
      .from("service_invoices")
      .update({ status: "refunded", collection_state: "void" })
      .eq("booking_id", booking.id);
    await supabase.from("service_settlement_events").upsert(
      {
        booking_id: booking.id,
        stripe_event_id: "refund_exec_" + refund.id,
        event_type: "refund.executed",
        outcome: "services_refund_executed",
        amount: request.refund_cents,
        currency: request.currency,
        meta: { refund_id: refund.id, request_id: request.id }
      },
      { onConflict: "stripe_event_id" }
    );
    return res.status(200).json({
      ok: true,
      refund_executed: true,
      stripe_refund_id: refund.id,
      booking_id: booking.id
    });
  }

  return sendError(res, 400, "Unknown services ops action");
}

module.exports = {
  SERVICES_OPS_ACTIONS,
  isServicesOpsAction,
  handleServicesOpsAction,
  ensureInvoiceForBooking
};
