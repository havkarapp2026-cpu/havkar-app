/**
 * Geocode listing/job/service/ad location labels onto map cards.
 * Never invents coordinates. Uses HAVKAR_MAP.geocode → Nominatim via hotels_geocode.
 * Remote jobs (data-remote="1") are skipped so misleading pins are not shown.
 */
(function (root) {
  "use strict";

  var cache = root.__havkarGeoCache || (root.__havkarGeoCache = Object.create(null));

  function geocodeLabel(label) {
    var key = String(label || "").trim().toLowerCase();
    if (!key || key.length < 3) return Promise.resolve(null);
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      return Promise.resolve(cache[key]);
    }
    var run = (async function () {
      try {
        if (root.HAVKAR_MAP && root.HAVKAR_MAP.geocode) {
          var g = await root.HAVKAR_MAP.geocode(label);
          if (g && g.ok && g.primary) return g.primary;
        }
        var res = await fetch("/api/hotels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "hotels_geocode", query: label })
        });
        var body = await res.json();
        return body && body.ok && body.primary ? body.primary : null;
      } catch (_e) {
        return null;
      }
    })();
    return run.then(function (primary) {
      cache[key] = primary;
      return primary;
    });
  }

  function readExistingCoords(el) {
    var lat = Number(el.getAttribute("data-lat") || el.getAttribute("data-latitude"));
    var lng = Number(el.getAttribute("data-lng") || el.getAttribute("data-longitude"));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng };
    }
    return null;
  }

  /**
   * @param {object} options
   * @param {string} options.selector - cards with data-location
   * @param {number} [options.limit]
   * @param {function} [options.onItems] - callback(items)
   */
  async function pinCards(options) {
    var opts = options || {};
    var selector = opts.selector || "[data-location]";
    var limit = Math.max(1, Number(opts.limit) || 24);
    var cards = Array.prototype.slice.call(document.querySelectorAll(selector)).slice(0, limit);
    var items = [];
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.getAttribute("data-remote") === "1" || card.getAttribute("data-remote") === "true") {
        continue;
      }
      var existing = readExistingCoords(card);
      var label =
        card.getAttribute("data-location") ||
        card.getAttribute("data-label") ||
        "";
      label = String(label || "").trim();
      var geo = existing;
      if (!geo) {
        if (!label || label.toLowerCase() === "location not specified" || label.toLowerCase() === "remote") {
          continue;
        }
        geo = await geocodeLabel(label);
      }
      if (!geo || !Number.isFinite(Number(geo.latitude)) || !Number.isFinite(Number(geo.longitude))) {
        continue;
      }
      var id =
        card.getAttribute("data-id") ||
        card.getAttribute("data-ad-id") ||
        card.getAttribute("data-job-id") ||
        card.getAttribute("data-service-id") ||
        card.getAttribute("data-event-id") ||
        ("geo" + i);
      card.setAttribute("data-lat", String(geo.latitude));
      card.setAttribute("data-lng", String(geo.longitude));
      card.setAttribute("data-id", id);
      if (label) card.setAttribute("data-label", label.slice(0, 80));
      items.push({
        id: id,
        latitude: Number(geo.latitude),
        longitude: Number(geo.longitude),
        label: (label || id).slice(0, 80)
      });
      (function (pinId) {
        card.addEventListener("click", function () {
          var panel = root.__havkarModuleMapPanel;
          if (panel && panel.api && panel.api.highlight) panel.api.highlight(pinId);
        });
      })(id);
    }
    if (typeof opts.onItems === "function") opts.onItems(items);
    var panel = root.__havkarModuleMapPanel;
    if (panel && panel.setItems) panel.setItems(items);
    return items;
  }

  function observeAndPin(rootEl, options) {
    var timer = null;
    function kick() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        pinCards(options);
      }, 450);
    }
    kick();
    if (!rootEl || typeof MutationObserver === "undefined") return;
    var obs = new MutationObserver(kick);
    obs.observe(rootEl, { childList: true, subtree: true });
    return obs;
  }

  /**
   * Geocode a free-text address for forms; returns {latitude,longitude,display_name} or null.
   */
  function geocodeAddress(query) {
    return geocodeLabel(query);
  }

  root.HAVKAR_GEO_PINS = {
    geocodeLabel: geocodeLabel,
    geocodeAddress: geocodeAddress,
    pinCards: pinCards,
    observeAndPin: observeAndPin
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
