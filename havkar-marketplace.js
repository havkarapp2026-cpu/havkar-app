/*
 * Marketplace fees and listing rules.
 * Publication is free. Buyer fee is 2 percent and seller fee is 3 percent.
 * Tax, shipping, card processing, and the Stellar network fee are separate.
 * Video bytes go to the private marketplace-media bucket. There is no transcoding.
 * This file does not mark a payment paid.
 */
(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.HAVKAR_MARKETPLACE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BUYER_FEE_RATE = 0.02;
  const SELLER_FEE_RATE = 0.03;
  const LISTING_PUBLICATION_FEE = 0;
  const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
  const MAX_VIDEO_SECONDS = 60;
  const LISTING_PAGE_SIZE = 24;
  const VIDEO_TYPES = ["video/mp4", "video/webm"];
  const ADVERTISING_CATEGORIES = ["restaurant", "shop", "service", "other"];
  const OPTIONAL_LISTING_COLUMNS = {
    listing_surface: true,
    currency: true,
    expires_at: true,
    video_path: true,
    video_content_type: true,
    video_bytes: true,
    video_duration_seconds: true,
    country_code: true,
    city: true
  };

  function money(value) {
    return Math.round(value * 100) / 100;
  }

  function quoteListingFees(price, currency) {
    const amount = Number(price);

    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: "Price must be a non-negative number." };
    }

    const code = String(currency || "EUR").trim().toUpperCase() || "EUR";

    return {
      ok: true,
      currency: code,
      price: money(amount),
      listingPublicationFee: LISTING_PUBLICATION_FEE,
      buyerFee: money(amount * BUYER_FEE_RATE),
      sellerFee: money(amount * SELLER_FEE_RATE),
      buyerPays: money(amount * (1 + BUYER_FEE_RATE)),
      sellerReceives: money(amount * (1 - SELLER_FEE_RATE)),
      tax: null,
      shipping: null,
      paymentProcessing: null
    };
  }

  function escapeListingSearch(value) {
    return String(value || "")
      .replace(/[%_,.()]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  function priceBound(value) {
    if (value === "" || value === null || value === undefined) {
      return { ok: false };
    }
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false };
    }
    return { ok: true, value: amount };
  }

  /*
   * Applies discoverability filters on a Supabase ads query.
   * Does not invent payments. Caller still page-ranges and orders.
   */
  function applyServerListingFilters(request, filters) {
    if (!request || typeof request.eq !== "function") {
      return request;
    }

    const input = filters || {};
    let query = request;
    const userId = String(input.userId || "").trim();

    if (userId) {
      query = query.or("status.eq.active,user_id.eq." + userId);
    } else {
      query = query.eq("status", "active");
    }

    if (typeof query.or === "function") {
      query = query.or(
        "expires_at.is.null,expires_at.gt." + new Date().toISOString()
      );
    }

    const country = String(input.country || "").trim().toUpperCase();
    if (country && typeof query.eq === "function") {
      query = query.eq("country_code", country);
    }

    const city = String(input.city || "").trim();
    if (city && typeof query.ilike === "function") {
      query = query.ilike("city", city);
    }

    const category = String(input.category || "").trim();
    if (
      category &&
      category.toLowerCase() !== "all" &&
      typeof query.ilike === "function"
    ) {
      query = query.ilike("category", category);
    }

    const min = priceBound(input.minPrice);
    const max = priceBound(input.maxPrice);

    if (min && min.ok && typeof query.gte === "function") {
      query = query.gte("price", min.value);
    }

    if (max && max.ok && typeof query.lte === "function") {
      query = query.lte("price", max.value);
    }

    const search = escapeListingSearch(input.search);
    if (search && typeof query.or === "function") {
      const pattern = "%" + search + "%";
      query = query.or(
        "title.ilike." +
          pattern +
          ",description.ilike." +
          pattern +
          ",location.ilike." +
          pattern
      );
    }

    return query;
  }

  function normalizedCategory(row) {
    return String(row && row.category || "").trim().toLowerCase();
  }

  function isAdvertisingRow(row) {
    if (!row) {
      return false;
    }

    if (row.listing_surface === "advertising") {
      return true;
    }

    if (row.listing_surface === "marketplace") {
      return false;
    }

    return ADVERTISING_CATEGORIES.indexOf(normalizedCategory(row)) !== -1;
  }

  function isMarketplaceRow(row) {
    if (!row) {
      return false;
    }

    if (row.listing_surface === "marketplace") {
      return true;
    }

    if (row.listing_surface === "advertising") {
      return false;
    }

    return !isAdvertisingRow(row);
  }

  function schemaColumnMissing(error) {
    const message = String(
      (error && (error.message || error.details || error.hint)) || ""
    ).toLowerCase();

    if (!/does not exist|schema cache|could not find/.test(message)) {
      return "";
    }

    const quoted = message.match(/['"]([a-z_][a-z0-9_]*)['"]/);

    if (quoted) {
      return quoted[1];
    }

    const dotted = message.match(/column\s+[a-z0-9_]+\.([a-z0-9_]+)\s+does not exist/);
    return dotted ? dotted[1] : "";
  }

  function listingSurfaceMissing(error) {
    if (schemaColumnMissing(error) === "listing_surface") {
      return true;
    }

    const message = String(
      (error && (error.message || error.details || error.hint)) || ""
    ).toLowerCase();

    return message.includes("listing_surface") &&
      /does not exist|schema cache|could not find/.test(message);
  }

  function omitMissingColumn(payload, error) {
    const column = schemaColumnMissing(error);

    if (!column || !OPTIONAL_LISTING_COLUMNS[column] || !payload || !Object.prototype.hasOwnProperty.call(payload, column)) {
      return null;
    }

    const next = {};

    Object.keys(payload).forEach(function (key) {
      if (key !== column) {
        next[key] = payload[key];
      }
    });

    return next;
  }

  function nextListingQuery(columns, surfaceFilter, error) {
    const missing = schemaColumnMissing(error);
    const list = Array.isArray(columns) ? columns : [];

    if (!missing || !OPTIONAL_LISTING_COLUMNS[missing] || list.indexOf(missing) === -1) {
      return null;
    }

    return {
      columns: list.filter(function (column) {
        return column !== missing;
      }),
      surfaceFilter: missing === "listing_surface" ? false : Boolean(surfaceFilter)
    };
  }

  function listingPageRange(page, pageSize) {
    const size = pageSize === undefined ? LISTING_PAGE_SIZE : pageSize;
    const index = Number(page);

    if (!Number.isInteger(index) || index < 0 || !Number.isInteger(size) || size < 1 || size > 100) {
      return null;
    }

    return {
      from: index * size,
      to: index * size + size - 1
    };
  }

  function validateListingVideo(file, durationSeconds) {
    if (!file) {
      return { ok: true, empty: true };
    }

    const type = String(file.type || "").toLowerCase();

    if (!VIDEO_TYPES.includes(type)) {
      return { ok: false, error: "Short videos must be MP4 or WebM." };
    }

    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_VIDEO_BYTES) {
      return { ok: false, error: "Short videos must be 15 MB or smaller." };
    }

    const duration = Number(durationSeconds);

    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_VIDEO_SECONDS) {
      return {
        ok: false,
        error: "Short videos must be 60 seconds or shorter. HAVKAR does not transcode video."
      };
    }

    return { ok: true, empty: false, contentType: type, bytes: file.size, durationSeconds: duration };
  }

  function listingVideoObjectPath(userId, contentType, objectId) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const owner = String(userId || "").trim();
    const id = String(objectId || "").trim();

    if (!uuid.test(owner) || !uuid.test(id)) {
      return { ok: false, error: "A signed-in owner is required before a video can be stored." };
    }

    if (contentType !== "video/mp4" && contentType !== "video/webm") {
      return { ok: false, error: "Short videos must be MP4 or WebM." };
    }

    const path = owner + "/" + id + (contentType === "video/webm" ? ".webm" : ".mp4");

    if (path.indexOf("..") !== -1) {
      return { ok: false, error: "The video path is not safe." };
    }

    return { ok: true, path: path };
  }

  function uploadListingVideo(options) {
    const input = options || {};
    const check = validateListingVideo(input.file, input.durationSeconds);

    if (!check.ok) {
      return Promise.resolve(check);
    }

    if (check.empty) {
      return Promise.resolve({ ok: true, empty: true, path: null });
    }

    const located = listingVideoObjectPath(input.userId, check.contentType, input.objectId);

    if (!located.ok) {
      return Promise.resolve(located);
    }

    const supabaseUrl = String(input.supabaseUrl || "").replace(/\/$/, "");
    const accessToken = String(input.accessToken || "");
    const apikey = String(input.apikey || "");

    if (!/^https:\/\//.test(supabaseUrl) || accessToken.length < 20 || apikey.length < 20) {
      return Promise.resolve({ ok: false, error: "Video storage is unavailable." });
    }

    if (typeof XMLHttpRequest !== "function") {
      return Promise.resolve({ ok: false, error: "This browser cannot upload a short video." });
    }

    return new Promise(function (resolve) {
      const request = new XMLHttpRequest();
      const endpoint = supabaseUrl + "/storage/v1/object/marketplace-media/" +
        located.path.split("/").map(encodeURIComponent).join("/");

      request.open("POST", endpoint);
      request.setRequestHeader("Authorization", "Bearer " + accessToken);
      request.setRequestHeader("apikey", apikey);
      request.setRequestHeader("Content-Type", check.contentType);
      request.setRequestHeader("x-upsert", "false");
      request.upload.onprogress = function (event) {
        if (typeof input.onProgress === "function" && event.lengthComputable && event.total > 0) {
          input.onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      request.onload = function () {
        if (request.status >= 200 && request.status < 300) {
          resolve({
            ok: true,
            empty: false,
            path: located.path,
            contentType: check.contentType,
            bytes: check.bytes,
            durationSeconds: check.durationSeconds
          });
          return;
        }

        resolve({ ok: false, error: "The short video could not be stored." });
      };
      request.onerror = function () {
        resolve({ ok: false, error: "The short video could not be stored." });
      };
      request.send(input.file);
    });
  }

  async function deleteListingVideo(client, objectPath) {
    const path = String(objectPath || "");

    if (!path) {
      return { ok: true };
    }

    if (path.indexOf("..") !== -1 || path.indexOf("/") < 1) {
      return { ok: false, error: "The video path is not safe." };
    }

    if (!client || !client.storage || typeof client.storage.from !== "function") {
      return { ok: false, error: "Video storage is unavailable." };
    }

    const removed = await client.storage.from("marketplace-media").remove([path]);

    if (removed.error) {
      return { ok: false, error: "The short video could not be removed." };
    }

    return { ok: true };
  }

  async function signedListingVideoUrl(client, objectPath) {
    const path = String(objectPath || "");

    if (!path || path.indexOf("..") !== -1) {
      return { ok: false, url: "" };
    }

    if (!client || !client.storage || typeof client.storage.from !== "function") {
      return { ok: false, url: "" };
    }

    const result = await client.storage.from("marketplace-media").createSignedUrl(path, 600);
    const url = result && result.data && result.data.signedUrl;

    if (result.error || typeof url !== "string" || url.indexOf("https://") !== 0) {
      return { ok: false, url: "" };
    }

    return { ok: true, url: url };
  }

  function listingCities(rows) {
    const seen = new Set();
    const cities = [];

    (rows || []).forEach(function (row) {
      const city = String(row && row.city || "").trim();
      const key = city.toLowerCase();

      if (!city || seen.has(key)) {
        return;
      }

      seen.add(key);
      cities.push(city);
    });

    cities.sort(function (left, right) {
      return left.localeCompare(right);
    });

    return cities;
  }

  function priceBound(value) {
    if (value == null || String(value).trim() === "") {
      return null;
    }

    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false };
    }

    return { ok: true, value: amount };
  }

  function listingMatchesPriceAndCity(row, filters) {
    const input = filters || {};
    const city = String(input.city || "").trim().toLowerCase();

    if (city && String(row && row.city || "").trim().toLowerCase() !== city) {
      return false;
    }

    const min = priceBound(input.minPrice);
    const max = priceBound(input.maxPrice);

    if ((min && min.ok === false) || (max && max.ok === false)) {
      return false;
    }

    if (min && max && min.ok && max.ok && min.value > max.value) {
      return false;
    }

    const price = Number(row && row.price);
    const hasPrice = Number.isFinite(price);

    if (min && min.ok && (!hasPrice || price < min.value)) {
      return false;
    }

    if (max && max.ok && (!hasPrice || price > max.value)) {
      return false;
    }

    return true;
  }

  function listingShareUrl(origin, id) {
    const listingId = String(id || "").trim();

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId)) {
      return "";
    }

    let base;

    try {
      base = new URL(String(origin || ""));
    } catch (error) {
      return "";
    }

    if (base.protocol !== "https:" && base.protocol !== "http:") {
      return "";
    }

    return base.origin + "/ad-details.html?id=" + encodeURIComponent(listingId);
  }

  async function shareListing(origin, id, navigatorLike) {
    const url = listingShareUrl(origin, id);

    if (!url) {
      return { ok: false, method: "rejected", url: "" };
    }

    const nav = navigatorLike || (typeof navigator === "undefined" ? null : navigator);

    if (nav && typeof nav.share === "function") {
      try {
        await nav.share({ title: "HAVKAR listing", url: url });
        return { ok: true, method: "share", url: url };
      } catch (error) {
        if (error && error.name === "AbortError") {
          return { ok: true, method: "cancel", url: url };
        }
      }
    }

    if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
      await nav.clipboard.writeText(url);
      return { ok: true, method: "copy", url: url };
    }

    return { ok: false, method: "unavailable", url: url };
  }

  return {
    BUYER_FEE_RATE,
    SELLER_FEE_RATE,
    LISTING_PUBLICATION_FEE,
    MAX_VIDEO_BYTES,
    MAX_VIDEO_SECONDS,
    LISTING_PAGE_SIZE,
    schemaColumnMissing,
    listingSurfaceMissing,
    omitMissingColumn,
    nextListingQuery,
    listingPageRange,
    listingCities,
    listingMatchesPriceAndCity,
    listingShareUrl,
    shareListing,
    quoteListingFees,
    escapeListingSearch,
    applyServerListingFilters,
    isMarketplaceRow,
    isAdvertisingRow,
    validateListingVideo,
    listingVideoObjectPath,
    uploadListingVideo,
    deleteListingVideo,
    signedListingVideoUrl
  };
});
