/*
 * HAVKAR Ads helpers — advertising surface only (not Buy & Sell / AI).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.HAVKAR_ADS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const AD_STATUSES = {
    active: true,
    paused: true,
    ended: true,
    pending_review: true,
    rejected: true
  };

  function isAdvertisingSurface(row) {
    const marketplace =
      typeof globalThis !== "undefined"
        ? globalThis.HAVKAR_MARKETPLACE
        : null;
    if (marketplace && typeof marketplace.isAdvertisingRow === "function") {
      return marketplace.isAdvertisingRow(row);
    }
    return Boolean(row && row.listing_surface === "advertising");
  }

  function detailUrl(adId) {
    return "ad-view.html?id=" + encodeURIComponent(String(adId || ""));
  }

  function isPubliclyVisible(ad, nowMs) {
    if (!ad || !isAdvertisingSurface(ad)) return false;
    if (String(ad.status || "").toLowerCase() !== "active") return false;
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    if (ad.starts_at && Date.parse(ad.starts_at) > now) return false;
    if (ad.expires_at && Date.parse(ad.expires_at) <= now) return false;
    return true;
  }

  function validateCreatePayload(input) {
    const errors = [];
    const title = String(input && input.title || "").trim();
    const category = String(input && input.category || "").trim();
    const location = String(input && input.location || "").trim();
    const description = String(input && input.description || "").trim();
    const country = String(input && input.country_code || "").trim().toUpperCase();
    const city = String(input && input.city || "").trim();
    const audience = String(input && input.target_audience || "").trim();

    if (!title || title.length > 150) errors.push("title");
    if (!category) errors.push("category");
    if (!location || location.length > 150) errors.push("location");
    if (!description || description.length > 1000) errors.push("description");
    if (country && !/^[A-Z]{2}$/.test(country)) errors.push("country_code");
    if (city.length > 120) errors.push("city");
    if (audience.length > 500) errors.push("target_audience");

    let price = null;
    if (input && input.price !== null && input.price !== undefined && String(input.price).trim() !== "") {
      price = Number(input.price);
      if (!Number.isFinite(price) || price < 0) errors.push("price");
    }

    let startsAt = null;
    let expiresAt = null;
    if (input && input.starts_at) {
      startsAt = String(input.starts_at);
      if (!Number.isFinite(Date.parse(startsAt))) errors.push("starts_at");
    }
    if (input && input.expires_at) {
      expiresAt = String(input.expires_at);
      if (!Number.isFinite(Date.parse(expiresAt))) errors.push("expires_at");
    }
    if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) {
      errors.push("schedule");
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      payload: {
        title: title,
        category: category,
        location: location,
        description: description,
        price: price,
        country_code: country || null,
        city: city || null,
        target_audience: audience || null,
        starts_at: startsAt,
        expires_at: expiresAt,
        campaign_id: input && input.campaign_id ? Number(input.campaign_id) : null,
        listing_surface: "advertising",
        status: "pending_review"
      }
    };
  }

  function statusLabel(status) {
    const value = String(status || "").toLowerCase();
    if (value === "pending_review") return "Pending review";
    if (value === "active") return "Active";
    if (value === "paused") return "Paused";
    if (value === "ended") return "Ended";
    if (value === "rejected") return "Rejected";
    return value || "Unknown";
  }

  return {
    AD_STATUSES: AD_STATUSES,
    isAdvertisingSurface: isAdvertisingSurface,
    detailUrl: detailUrl,
    isPubliclyVisible: isPubliclyVisible,
    validateCreatePayload: validateCreatePayload,
    statusLabel: statusLabel
  };
});
