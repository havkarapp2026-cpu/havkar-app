/**
 * HAVKAR Buy & Sell — privacy-safe global discovery map.
 * City/country approximate markers only. Never plots exact home coordinates
 * unless a listing explicitly provides public approx fields.
 * Reuses Leaflet + Nominatim geocode via /api/flights?action=geocode.
 */
(function () {
  "use strict";

  if (!window.L) {
    console.warn("HAVKAR buy-sell map: Leaflet not loaded");
    return;
  }

  var mapEl = document.getElementById("buySellWorldMap");
  if (!mapEl) return;

  var searchInput = document.getElementById("buySellMapSearch");
  var searchBtn = document.getElementById("buySellMapSearchBtn");
  var statusEl = document.getElementById("buySellMapStatus");
  var resultsEl = document.getElementById("buySellMapResults");
  var privacyEl = document.getElementById("buySellMapPrivacy");

  var map = L.map(mapEl, {
    worldCopyJump: true,
    minZoom: 2,
    maxZoom: 12,
    scrollWheelZoom: true
  }).setView([30, 10], 2);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20
  }).addTo(map);

  var markersLayer =
    typeof L.markerClusterGroup === "function"
      ? L.markerClusterGroup({
          showCoverageOnHover: false,
          maxClusterRadius: 55,
          spiderfyOnMaxZoom: true
        })
      : L.layerGroup();
  markersLayer.addTo(map);
  var listingCache = [];

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pinHtml() {
    return '<div class="havkar-map-pin" style="--pin:#2e7d32"><i class="fas fa-bag-shopping" aria-hidden="true"></i></div>';
  }

  function makeIcon() {
    return L.divIcon({
      className: "havkar-map-pin-wrap",
      html: pinHtml(),
      iconSize: [36, 36],
      iconAnchor: [18, 34]
    });
  }

  // Deterministic city jitter so markers don't stack, still not exact address.
  function approxOffset(seed) {
    var n = 0;
    var text = String(seed || "x");
    for (var i = 0; i < text.length; i += 1) n = (n * 31 + text.charCodeAt(i)) % 997;
    var latJ = ((n % 17) - 8) * 0.02;
    var lngJ = (((n * 7) % 17) - 8) * 0.02;
    return { lat: latJ, lng: lngJ };
  }

  async function geocodeCity(query) {
    var q = String(query || "").trim();
    if (q.length < 2) return null;
    try {
      var response = await fetch(
        "/api/flights?action=geocode&q=" + encodeURIComponent(q),
        { headers: { Accept: "application/json" } }
      );
      var body = await response.json().catch(function () {
        return null;
      });
      if (!response.ok || !body || !body.ok || !body.primary) return null;
      return body.primary;
    } catch (_e) {
      return null;
    }
  }

  function renderListingMarkers(rows) {
    markersLayer.clearLayers();
    listingCache = Array.isArray(rows) ? rows : [];
    var bounds = [];
    listingCache.forEach(function (row) {
      if (!row || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) return;
      var marker = L.marker([row.latitude, row.longitude], { icon: makeIcon() });
      var price =
        row.price != null
          ? String(row.price) + " " + String(row.currency || "EUR")
          : "";
      marker.bindPopup(
        "<strong>" +
          escapeHtml(row.title || "Listing") +
          "</strong><br>" +
          escapeHtml(row.place_label || "") +
          (price ? "<br>" + escapeHtml(price) : "") +
          '<br><a href="product.html?id=' +
          encodeURIComponent(row.id) +
          '">Open listing</a>' +
          "<br><small>Approximate city location — exact address hidden.</small>"
      );
      marker.addTo(markersLayer);
      bounds.push([row.latitude, row.longitude]);
    });
    if (bounds.length) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 8 });
    }
    setStatus(
      listingCache.length
        ? "Showing " +
            listingCache.length +
            " approximate listing location(s). Exact seller addresses are never shown."
        : "No mappable listings yet. Listings need a city/country for privacy-safe map placement."
    );
  }

  async function plotListingsFromState() {
    var source =
      (window.HAVKAR_BUYSELL_MAP_LISTINGS &&
        window.HAVKAR_BUYSELL_MAP_LISTINGS()) ||
      [];
    if (!Array.isArray(source) || !source.length) {
      renderListingMarkers([]);
      return;
    }

    var mapped = [];
    // Cap geocode calls for performance.
    var slice = source.slice(0, 40);
    for (var i = 0; i < slice.length; i += 1) {
      var ad = slice[i];
      var place = [ad.city, ad.country_code || ad.location]
        .filter(Boolean)
        .join(", ");
      if (!place) continue;
      var geo = await geocodeCity(place);
      if (!geo) continue;
      var jitter = approxOffset(ad.id + ":" + place);
      mapped.push({
        id: ad.id,
        title: ad.title,
        price: ad.price,
        currency: ad.currency || "EUR",
        place_label: place,
        latitude: geo.latitude + jitter.lat,
        longitude: geo.longitude + jitter.lng
      });
    }
    renderListingMarkers(mapped);
  }

  async function searchPlace() {
    var q = searchInput && searchInput.value;
    setStatus("Searching map area…");
    var primary = await geocodeCity(q);
    if (!primary) {
      setStatus("No place found. Try another city or country.");
      if (resultsEl) resultsEl.innerHTML = "";
      return;
    }
    map.flyTo([primary.latitude, primary.longitude], 6, { duration: 0.8 });
    if (resultsEl) {
      resultsEl.innerHTML =
        '<button type="button" class="tickets-map-result"><strong></strong><span></span></button>';
      resultsEl.querySelector("strong").textContent = primary.label;
      resultsEl.querySelector("span").textContent =
        "Approximate area center · privacy-safe";
    }
    setStatus("Map centered on verified place. Listing markers use city-level approximation only.");
    await plotListingsFromState();
  }

  if (searchBtn) searchBtn.addEventListener("click", searchPlace);
  if (searchInput) {
    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        searchPlace();
      }
    });
  }

  if (privacyEl) {
    privacyEl.textContent =
      "Privacy: markers use city/country approximation with light jitter. Exact home coordinates are never published without explicit consent.";
  }

  window.addEventListener("havkar:buysell-map-refresh", function () {
    plotListingsFromState();
    setTimeout(function () {
      map.invalidateSize();
    }, 60);
  });
  window.addEventListener("resize", function () {
    map.invalidateSize();
  });

  setStatus("Search a city or country, then browse approximate listing markers.");
  window.HAVKAR_BUYSELL_MAP = {
    map: map,
    refresh: plotListingsFromState
  };

  // Initial plot when listings become available.
  setTimeout(function () {
    plotListingsFromState();
  }, 700);
})();
