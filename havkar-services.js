/*
 * HAVKAR service management rules.
 *
 * Uses only columns and status values present in the committed
 * schema snapshot. It does not grant permissions. Row Level
 * Security remains the database authorization.
 */
(function (root, factory) {

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.HAVKAR_SERVICES = api;

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  const PRICE_TYPES = ["fixed", "hourly", "daily", "negotiable"];
  const CURRENCIES = ["EUR", "USD", "GBP", "SEK"];
  const SERVICE_STATUSES = ["active", "paused", "closed"];
  const SERVICE_COLUMNS = "id,created_at,updated_at,provider_id,title,category,description,price,currency,price_type,location,image_url,status";
  const BOOKING_COLUMNS = "id,created_at,updated_at,service_id,customer_id,provider_id,booking_date,booking_time,message,status";

  function parsePriceInput(value) {

    const normalized = String(value || "").replace(",", ".").trim();
    const match = normalized.match(/(\d+(?:\.\d{1,2})?)/);

    if (!match) {
      return { ok: false, reason: "invalid_price" };
    }

    const amount = Number(match[1]);

    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, reason: "invalid_price" };
    }

    const lower = normalized.toLowerCase();
    let priceType = "fixed";

    if (lower.indexOf("negotiable") !== -1) {
      priceType = "negotiable";
    } else if (lower.indexOf("hour") !== -1) {
      priceType = "hourly";
    } else if (lower.indexOf("day") !== -1) {
      priceType = "daily";
    } else if (
      lower.indexOf("job") !== -1 ||
      lower.indexOf("visit") !== -1
    ) {
      return { ok: false, reason: "unsupported_price_type" };
    }

    if (PRICE_TYPES.indexOf(priceType) === -1) {
      return { ok: false, reason: "unsupported_price_type" };
    }

    return {
      ok: true,
      amount: amount,
      priceType: priceType
    };

  }

  function providerBookingTransition(fromStatus, toStatus) {

    if (fromStatus === "pending" && (toStatus === "accepted" || toStatus === "declined")) {
      return true;
    }

    if (fromStatus === "accepted" && toStatus === "completed") {
      return true;
    }

    return false;

  }

  function customerBookingTransition(fromStatus, toStatus) {

    return toStatus === "cancelled" &&
      (fromStatus === "pending" || fromStatus === "accepted");

  }

  function serviceStatusActions(fromStatus) {

    if (fromStatus === "active") {
      return [
        { to: "paused", label: "Pause" },
        { to: "closed", label: "Close" }
      ];
    }

    if (fromStatus === "paused") {
      return [
        { to: "active", label: "Reactivate" },
        { to: "closed", label: "Close" }
      ];
    }

    if (fromStatus === "closed") {
      return [
        { to: "active", label: "Reactivate" }
      ];
    }

    return [];

  }

  function canChangeServiceStatus(fromStatus, toStatus) {

    return serviceStatusActions(fromStatus).some(function (action) {
      return action.to === toStatus;
    });

  }

  function canBookService(service, userId) {

    if (!service || !userId) {
      return false;
    }

    if (String(service.provider_id) === String(userId)) {
      return false;
    }

    if (service.status !== "active") {
      return false;
    }

    return true;

  }

  function validateServiceDraft(draft) {

    const title = String(draft.title || "").trim();
    const category = String(draft.category || "").trim();
    const description = String(draft.description || "").trim();
    const location = String(draft.location || "").trim();
    const currency = String(draft.currency || "EUR").trim().toUpperCase();
    const priceType = String(draft.priceType || draft.price_type || "").trim();
    const status = String(draft.status || "active").trim();
    const amount = Number(draft.price);

    if (title.length < 3 || title.length > 120) {
      return { ok: false, reason: "invalid_title" };
    }

    if (!category || category.length > 80) {
      return { ok: false, reason: "invalid_category" };
    }

    if (description.length < 10 || description.length > 3000) {
      return { ok: false, reason: "invalid_description" };
    }

    if (!location || location.length > 120) {
      return { ok: false, reason: "invalid_location" };
    }

    if (CURRENCIES.indexOf(currency) === -1) {
      return { ok: false, reason: "invalid_currency" };
    }

    if (PRICE_TYPES.indexOf(priceType) === -1) {
      return { ok: false, reason: "unsupported_price_type" };
    }

    if (SERVICE_STATUSES.indexOf(status) === -1) {
      return { ok: false, reason: "invalid_status" };
    }

    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, reason: "invalid_price" };
    }

    return {
      ok: true,
      payload: {
        title: title,
        category: category,
        description: description,
        location: location,
        currency: currency,
        price_type: priceType,
        price: amount,
        status: status
      }
    };

  }

  function confirmedRow(result) {

    if (!result || result.error) {
      return null;
    }

    if (Array.isArray(result.data) && result.data.length === 1) {
      return result.data[0];
    }

    if (result.data && !Array.isArray(result.data) && result.data.id) {
      return result.data;
    }

    return null;

  }

  async function applyBookingTransition(client, action) {

    const role = action && action.role;
    const fromStatus = action && action.fromStatus;
    const toStatus = action && action.toStatus;
    const allowed = role === "provider"
      ? providerBookingTransition(fromStatus, toStatus)
      : role === "customer"
        ? customerBookingTransition(fromStatus, toStatus)
        : false;

    if (!allowed) {
      return { ok: false, reason: "blocked_transition" };
    }

    const ownerColumn = role === "provider" ? "provider_id" : "customer_id";
    const result = await client
      .from("service_bookings")
      .update({ status: toStatus })
      .eq("id", action.bookingId)
      .eq(ownerColumn, action.userId)
      .eq("status", fromStatus)
      .select("id,status,customer_id,provider_id,service_id");

    const row = confirmedRow(result);

    if (!row) {
      return {
        ok: false,
        reason: result && result.error ? "rejected" : "not_confirmed"
      };
    }

    return { ok: true, booking: row };

  }

  async function updateOwnService(client, action) {

    const draft = validateServiceDraft(action.draft || {});

    if (!draft.ok) {
      return draft;
    }

    if (
      action.fromStatus &&
      draft.payload.status !== action.fromStatus &&
      !canChangeServiceStatus(action.fromStatus, draft.payload.status)
    ) {
      return { ok: false, reason: "blocked_transition" };
    }

    let query = client
      .from("services")
      .update(draft.payload)
      .eq("id", action.serviceId)
      .eq("provider_id", action.userId);

    if (action.fromStatus) {
      query = query.eq("status", action.fromStatus);
    }

    const result = await query.select(SERVICE_COLUMNS);
    const row = confirmedRow(result);

    if (!row) {
      return {
        ok: false,
        reason: result && result.error ? "rejected" : "not_confirmed"
      };
    }

    return { ok: true, service: row };

  }

  async function updateOwnServiceStatus(client, action) {

    if (!canChangeServiceStatus(action.fromStatus, action.toStatus)) {
      return { ok: false, reason: "blocked_transition" };
    }

    const result = await client
      .from("services")
      .update({ status: action.toStatus })
      .eq("id", action.serviceId)
      .eq("provider_id", action.userId)
      .eq("status", action.fromStatus)
      .select(SERVICE_COLUMNS);

    const row = confirmedRow(result);

    if (!row) {
      return {
        ok: false,
        reason: result && result.error ? "rejected" : "not_confirmed"
      };
    }

    return { ok: true, service: row };

  }

  return {
    PRICE_TYPES: PRICE_TYPES,
    CURRENCIES: CURRENCIES,
    SERVICE_STATUSES: SERVICE_STATUSES,
    SERVICE_COLUMNS: SERVICE_COLUMNS,
    BOOKING_COLUMNS: BOOKING_COLUMNS,
    parsePriceInput: parsePriceInput,
    providerBookingTransition: providerBookingTransition,
    customerBookingTransition: customerBookingTransition,
    serviceStatusActions: serviceStatusActions,
    canChangeServiceStatus: canChangeServiceStatus,
    canBookService: canBookService,
    validateServiceDraft: validateServiceDraft,
    applyBookingTransition: applyBookingTransition,
    updateOwnService: updateOwnService,
    updateOwnServiceStatus: updateOwnServiceStatus
  };

});
