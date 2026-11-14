/**
 * HAVKAR Tickets — premium interactive discovery map.
 * Leaflet + OSM tiles + Nominatim (via /api/flights?action=geocode).
 * Does not invent fares, schedules, seat availability, or booking confirmations.
 */
(function () {
  "use strict";

  if (!window.L) {
    console.warn("HAVKAR tickets map: Leaflet not loaded");
    return;
  }

  var mapEl = document.getElementById("ticketsWorldMap");
  if (!mapEl) return;

  var searchInput = document.getElementById("ticketsMapSearch");
  var searchBtn = document.getElementById("ticketsMapSearchBtn");
  var statusEl = document.getElementById("ticketsMapStatus");
  var resultsEl = document.getElementById("ticketsMapResults");
  var originLabel = document.getElementById("ticketsMapOriginLabel");
  var destLabel = document.getElementById("ticketsMapDestLabel");
  var setOriginBtn = document.getElementById("ticketsMapUseOrigin");
  var setDestBtn = document.getElementById("ticketsMapUseDest");
  var clearBtn = document.getElementById("ticketsMapClear");
  var applyFlightBtn = document.getElementById("ticketsMapApplyFlight");
  var modeButtons = Array.prototype.slice.call(
    document.querySelectorAll("[data-map-mode]")
  );

  var state = {
    mode: "all",
    origin: null,
    destination: null,
    focus: null,
    markers: [],
    routeLine: null
  };

  var map = L.map(mapEl, {
    worldCopyJump: true,
    zoomControl: true,
    minZoom: 2,
    maxZoom: 12,
    scrollWheelZoom: true
  }).setView([25, 12], 2);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20
  }).addTo(map);

  var markersLayer = L.layerGroup().addTo(map);
  var routeLayer = L.layerGroup().addTo(map);

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message || "";
  }

  function modeIcon(mode) {
    if (mode === "flight") return "plane";
    if (mode === "train") return "train";
    if (mode === "bus") return "bus";
    if (mode === "ferry") return "ship";
    return "location-dot";
  }

  function pinHtml(kind, mode) {
    var color =
      kind === "origin" ? "#3e6b22" : kind === "destination" ? "#558b2f" : "#7cb342";
    return (
      '<div class="havkar-map-pin" style="--pin:' +
      color +
      '"><i class="fas fa-' +
      modeIcon(mode || state.mode) +
      '" aria-hidden="true"></i></div>'
    );
  }

  function makeIcon(kind, mode) {
    return L.divIcon({
      className: "havkar-map-pin-wrap",
      html: pinHtml(kind, mode),
      iconSize: [36, 36],
      iconAnchor: [18, 34]
    });
  }

  function clearMarkers() {
    markersLayer.clearLayers();
    state.markers = [];
  }

  function redrawRoute() {
    routeLayer.clearLayers();
    state.routeLine = null;
    if (!state.origin || !state.destination) return;
    var latlngs = [
      [state.origin.latitude, state.origin.longitude],
      [state.destination.latitude, state.destination.longitude]
    ];
    state.routeLine = L.polyline(latlngs, {
      color: "#3e6b22",
      weight: 3,
      opacity: 0.85,
      dashArray: "8 8",
      className: "havkar-route-line"
    }).addTo(routeLayer);
    map.fitBounds(L.latLngBounds(latlngs).pad(0.35), { animate: true });
  }

  function placeEndpoint(kind, place) {
    if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) {
      return;
    }
    state[kind] = place;
    var label = place.label || place.name || "Selected place";
    if (kind === "origin" && originLabel) originLabel.textContent = label;
    if (kind === "destination" && destLabel) destLabel.textContent = label;
    redrawEndpoints();
    redrawRoute();
    setStatus(
      kind === "origin"
        ? "Origin set from verified geocoding. No fares invented."
        : "Destination set from verified geocoding. No fares invented."
    );
  }

  function redrawEndpoints() {
    clearMarkers();
    if (state.origin) {
      L.marker([state.origin.latitude, state.origin.longitude], {
        icon: makeIcon("origin", state.mode),
        title: "Origin"
      })
        .addTo(markersLayer)
        .bindPopup("<strong>Origin</strong><br>" + escapeHtml(state.origin.label || ""));
    }
    if (state.destination) {
      L.marker([state.destination.latitude, state.destination.longitude], {
        icon: makeIcon("destination", state.mode),
        title: "Destination"
      })
        .addTo(markersLayer)
        .bindPopup(
          "<strong>Destination</strong><br>" + escapeHtml(state.destination.label || "")
        );
    }
    if (state.focus && !state.origin && !state.destination) {
      L.marker([state.focus.latitude, state.focus.longitude], {
        icon: makeIcon("focus", state.mode)
      })
        .addTo(markersLayer)
        .bindPopup(escapeHtml(state.focus.label || "Place"));
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderResults(rows) {
    if (!resultsEl) return;
    resultsEl.innerHTML = "";
    if (!rows || !rows.length) {
      resultsEl.innerHTML =
        '<p class="tickets-map-empty">No matching places from the geocoder. Try another spelling. HAVKAR does not invent destinations.</p>';
      return;
    }
    rows.slice(0, 8).forEach(function (row) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tickets-map-result";
      btn.innerHTML =
        '<strong></strong><span></span><em class="tickets-map-coords"></em>';
      btn.querySelector("strong").textContent = row.label || "Place";
      btn.querySelector("span").textContent =
        (row.type ? String(row.type) : "place") +
        (row.country_code ? " · " + String(row.country_code).toUpperCase() : "");
      btn.querySelector("em").textContent =
        Number(row.latitude).toFixed(4) + ", " + Number(row.longitude).toFixed(4);
      btn.addEventListener("click", function () {
        state.focus = row;
        map.flyTo([row.latitude, row.longitude], Math.max(map.getZoom(), 6), {
          duration: 0.8
        });
        redrawEndpoints();
        L.popup()
          .setLatLng([row.latitude, row.longitude])
          .setContent(
            "<strong>" +
              escapeHtml(row.label) +
              "</strong><br>Use the buttons to set origin or destination."
          )
          .openOn(map);
      });
      resultsEl.appendChild(btn);
    });
  }

  async function geocode(query) {
    var q = String(query || "").trim();
    if (q.length < 2) {
      setStatus("Enter at least 2 characters for worldwide place search.");
      return;
    }
    setStatus("Searching geographic places…");
    try {
      var response = await fetch(
        "/api/flights?action=geocode&q=" + encodeURIComponent(q),
        { headers: { Accept: "application/json" } }
      );
      var body = await response.json().catch(function () {
        return null;
      });
      if (!response.ok || !body || body.ok === false) {
        setStatus(
          (body && body.error) ||
            "Geocoding unavailable. No invented destinations are shown."
        );
        renderResults([]);
        return;
      }
      var rows = Array.isArray(body.results) ? body.results : [];
      if (body.primary) state.focus = body.primary;
      renderResults(rows);
      if (body.primary) {
        map.flyTo([body.primary.latitude, body.primary.longitude], 5, {
          duration: 0.9
        });
        redrawEndpoints();
      }
      setStatus(
        rows.length
          ? "Showing " +
              rows.length +
              " verified place(s) from OpenStreetMap Nominatim. Prices and schedules are not invented here."
          : "No places found."
      );
    } catch (_err) {
      setStatus("Could not reach geocoding. Check your connection.");
      renderResults([]);
    }
  }

  function supplierNoteForMode(mode) {
    if (mode === "flight") {
      return "Flights: Duffel search after sign-in. Live paid booking stays gated.";
    }
    if (mode === "train" || mode === "bus" || mode === "ferry") {
      return "Ground travel: Omio affiliate widget. Booking completes on Omio.";
    }
    if (mode === "events") {
      return "Event tickets are separate from transport booking.";
    }
    return "Select a transport filter. Unavailable partners show clear unavailable states.";
  }

  modeButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var mode = button.getAttribute("data-map-mode") || "all";
      state.mode = mode;
      modeButtons.forEach(function (b) {
        var on = b === button;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      setStatus(supplierNoteForMode(mode));
      redrawEndpoints();
      if (mode !== "all") {
        window.dispatchEvent(
          new CustomEvent("havkar:tickets-show", { detail: { type: mode } })
        );
      }
    });
  });

  if (searchBtn) {
    searchBtn.addEventListener("click", function () {
      geocode(searchInput && searchInput.value);
    });
  }
  if (searchInput) {
    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        geocode(searchInput.value);
      }
    });
  }

  if (setOriginBtn) {
    setOriginBtn.addEventListener("click", function () {
      if (!state.focus) {
        setStatus("Search or click a result first, then set origin.");
        return;
      }
      placeEndpoint("origin", state.focus);
    });
  }
  if (setDestBtn) {
    setDestBtn.addEventListener("click", function () {
      if (!state.focus) {
        setStatus("Search or click a result first, then set destination.");
        return;
      }
      placeEndpoint("destination", state.focus);
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      state.origin = null;
      state.destination = null;
      state.focus = null;
      if (originLabel) originLabel.textContent = "Not set";
      if (destLabel) destLabel.textContent = "Not set";
      clearMarkers();
      routeLayer.clearLayers();
      if (resultsEl) resultsEl.innerHTML = "";
      setStatus("Map cleared. Search a country, city, airport, station, or port.");
      map.setView([25, 12], 2, { animate: true });
    });
  }

  if (applyFlightBtn) {
    applyFlightBtn.addEventListener("click", function () {
      window.dispatchEvent(
        new CustomEvent("havkar:tickets-show", { detail: { type: "flight" } })
      );
      setStatus(
        "Opened Flights. Use airport autocomplete for IATA codes — map places are geographic only and are not invented fares."
      );
      var panel = document.getElementById("ticket-flight");
      if (panel) panel.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  map.on("click", function (event) {
    setStatus(
      "Map click at " +
        event.latlng.lat.toFixed(4) +
        ", " +
        event.latlng.lng.toFixed(4) +
        ". Use place search for named destinations (airports, stations, ports)."
    );
  });

  function refreshMapSize() {
    setTimeout(function () {
      map.invalidateSize();
    }, 80);
  }
  window.addEventListener("havkar:tickets-show", refreshMapSize);
  window.addEventListener("havkar:tickets-map-resize", refreshMapSize);
  window.addEventListener("resize", refreshMapSize);

  setStatus(
    "Explore the world map. Search real places only. Transport availability depends on approved suppliers."
  );

  // Expose for tests
  window.HAVKAR_TICKETS_MAP = {
    map: map,
    getState: function () {
      return {
        mode: state.mode,
        origin: state.origin,
        destination: state.destination
      };
    },
    geocode: geocode
  };
})();
