/**
 * Professional HAVKAR map toolbar for Tickets + Accommodation.
 * Uses real TomTom proxies only. No fake buttons. Maps Plus stays sales-off.
 */
(function (root) {
  "use strict";

  function mt(key, vars) {
    try {
      if (root.HAVKAR_MAP_I18N && typeof root.HAVKAR_MAP_I18N.t === "function") {
        return root.HAVKAR_MAP_I18N.t(key, vars);
      }
    } catch (_e) {}
    return key;
  }

  function mapDir() {
    try {
      if (root.HAVKAR_MAP_I18N && typeof root.HAVKAR_MAP_I18N.dir === "function") {
        return root.HAVKAR_MAP_I18N.dir();
      }
    } catch (_e) {}
    return "ltr";
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "className") node.className = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function ensureCss() {
    if (document.getElementById("havkar-map-pro-css")) return;
    var link = document.createElement("link");
    link.id = "havkar-map-pro-css";
    link.rel = "stylesheet";
    link.href = "/havkar-map-pro.css";
    document.head.appendChild(link);
  }

  function getMapApi(opts) {
    if (opts.api && opts.api.map) return opts.api;
    if (opts.map && opts.L) {
      return {
        map: opts.map,
        L: opts.L,
        setCenter: function (lat, lng, zoom) {
          opts.map.setView([lat, lng], zoom || opts.map.getZoom());
        },
        clearPins: function () {},
        clearRoute: function () {},
        setMarkers: function () {},
        requestRoute: null,
        requestGps: null,
        geocode: root.HAVKAR_MAP && root.HAVKAR_MAP.geocode
      };
    }
    return null;
  }

  function attach(options) {
    ensureCss();
    var opts = options || {};
    var host =
      typeof opts.container === "string"
        ? document.getElementById(opts.container)
        : opts.container;
    var mapShell =
      typeof opts.mapShell === "string"
        ? document.getElementById(opts.mapShell)
        : opts.mapShell;
    var mapHost =
      typeof opts.mapHost === "string"
        ? document.getElementById(opts.mapHost)
        : opts.mapHost;
    var setNote =
      typeof opts.setNote === "function"
        ? opts.setNote
        : function () {};
    var api = getMapApi(opts);
    if (!host) return { ok: false, error: "toolbar_host_missing" };

    host.innerHTML = "";
    host.classList.add("havkar-map-pro");
    host.setAttribute("dir", mapDir());
    host.setAttribute("lang", (root.HAVKAR_MAP_I18N && root.HAVKAR_MAP_I18N.lang && root.HAVKAR_MAP_I18N.lang()) || "en");

    var badges = el("div", { className: "havkar-map-pro-badges" });
    var freeBadge = el("span", { className: "havkar-map-pro-badge", "data-kind": "free", "data-i18n-map": "maps.badge_free" }, mt("maps.badge_free"));
    badges.appendChild(freeBadge);
    var trafficBadge = el("span", { className: "havkar-map-pro-badge", "data-kind": "traffic" }, mt("maps.badge_traffic_checking"));
    badges.appendChild(trafficBadge);
    var plusBadge = el("span", { className: "havkar-map-pro-badge", "data-kind": "plus", "data-i18n-map": "maps.badge_plus_off" }, mt("maps.badge_plus_off"));
    badges.appendChild(plusBadge);
    host.appendChild(badges);

    var searchRow = el("div", { className: "havkar-map-pro-search" });
    var placeInput = el("input", {
      type: "search",
      "data-pro": "place",
      placeholder: mt("maps.search_placeholder"),
      "data-i18n-map-placeholder": "maps.search_placeholder",
      autocomplete: "off",
      "aria-label": mt("maps.search_place"),
      "data-i18n-map-aria": "maps.search_place"
    });
    var placeBtn = el("button", { type: "button", className: "primary", "data-pro": "place-go", "data-i18n-map": "maps.search_place" }, mt("maps.search_place"));
    searchRow.appendChild(placeInput);
    searchRow.appendChild(placeBtn);
    host.appendChild(searchRow);
    var suggestBox = el("div", {
      className: "havkar-map-pro-suggest",
      "data-pro": "suggest",
      hidden: "hidden",
      role: "listbox",
      "aria-label": mt("maps.search_place")
    });
    host.appendChild(suggestBox);

    var nearRow = el("div", { className: "havkar-map-pro-near" });
    var radiusLabel = el("label", null, mt("maps.nearby_radius") + " ");
    var radiusSel = el("select", { "data-pro": "radius", "aria-label": mt("maps.nearby_radius") });
    [1, 2, 3, 5, 10, 15].forEach(function (n) {
      var o = el("option", { value: String(n) }, String(n) + " km");
      if (n === 3) o.selected = true;
      radiusSel.appendChild(o);
    });
    radiusLabel.appendChild(radiusSel);
    var nearCamsBtn = el("button", { type: "button", "data-pro": "near-cams", "data-i18n-map": "maps.nearby_cameras" }, mt("maps.nearby_cameras"));
    var nearPhotosBtn = el("button", { type: "button", "data-pro": "near-photos", "data-i18n-map": "maps.nearby_photos" }, mt("maps.nearby_photos"));
    var streetViewBtn = el("button", { type: "button", "data-pro": "street-view", "data-i18n-map": "maps.street_view_360" }, mt("maps.street_view_360"));
    var surroundBtn = el("button", { type: "button", className: "primary", "data-pro": "surroundings", "data-i18n-map": "maps.view_surroundings" }, mt("maps.view_surroundings"));
    nearRow.appendChild(radiusLabel);
    nearRow.appendChild(nearCamsBtn);
    nearRow.appendChild(nearPhotosBtn);
    nearRow.appendChild(streetViewBtn);
    nearRow.appendChild(surroundBtn);
    host.appendChild(nearRow);

    var routeRow = el("div", { className: "havkar-map-pro-route" });
    var fromInput = el("input", {
      type: "search",
      "data-pro": "from",
      placeholder: mt("maps.origin"),
      "data-i18n-map-placeholder": "maps.origin",
      autocomplete: "off",
      "aria-label": mt("maps.origin"),
      "data-i18n-map-aria": "maps.origin"
    });
    var toInput = el("input", {
      type: "search",
      "data-pro": "to",
      placeholder: mt("maps.destination"),
      "data-i18n-map-placeholder": "maps.destination",
      autocomplete: "off",
      "aria-label": mt("maps.destination"),
      "data-i18n-map-aria": "maps.destination"
    });
    var routeBtn = el("button", { type: "button", className: "primary", "data-pro": "route-go", "data-i18n-map": "maps.route" }, mt("maps.route"));
    routeRow.appendChild(fromInput);
    routeRow.appendChild(toInput);
    routeRow.appendChild(routeBtn);
    host.appendChild(routeRow);

    var actions = el("div", { className: "havkar-map-pro-actions", role: "group", "aria-label": mt("maps.route") });
    var gpsBtn = el("button", { type: "button", "data-pro": "gps", "aria-label": mt("maps.my_location"), "data-i18n-map": "maps.my_location" }, mt("maps.my_location"));
    var useOriginBtn = el(
      "button",
      {
        type: "button",
        "data-pro": "gps-origin",
        hidden: "hidden",
        disabled: "disabled",
        "aria-label": mt("maps.use_as_origin"),
        "data-i18n-map": "maps.use_as_origin"
      },
      mt("maps.use_as_origin")
    );
    var shareBtn = el("button", { type: "button", "data-pro": "share", "data-i18n-map": "maps.share" }, mt("maps.share"));
    var copyBtn = el("button", { type: "button", "data-pro": "copy", "data-i18n-map": "maps.copy_link" }, mt("maps.copy_link"));
    var fullBtn = el("button", { type: "button", "data-pro": "fullscreen", "data-i18n-map": "maps.fullscreen" }, mt("maps.fullscreen"));
    var zoomInBtn = el("button", { type: "button", "data-pro": "zoom-in", "aria-label": "Zoom in" }, "+");
    var zoomOutBtn = el("button", { type: "button", "data-pro": "zoom-out", "aria-label": "Zoom out" }, "−");
    [gpsBtn, useOriginBtn, shareBtn, copyBtn, fullBtn, zoomInBtn, zoomOutBtn].forEach(function (b) {
      actions.appendChild(b);
    });
    host.appendChild(actions);

    /* Device GPS only — never POST/upload coordinates to HAVKAR without consent. */
    var lastGps = null;
    var gpsLayer = null;

    var status = el("p", { className: "havkar-map-pro-status", role: "status", "data-pro": "status", "data-i18n-map": "maps.status_intro" });
    status.textContent = mt("maps.status_intro");
    host.appendChild(status);

    function refreshMapChrome() {
      host.setAttribute("dir", mapDir());
      host.setAttribute("lang", (root.HAVKAR_MAP_I18N && root.HAVKAR_MAP_I18N.lang && root.HAVKAR_MAP_I18N.lang()) || "en");
      if (root.HAVKAR_MAP_I18N && typeof root.HAVKAR_MAP_I18N.apply === "function") {
        root.HAVKAR_MAP_I18N.apply(host);
      }
      freeBadge.textContent = mt("maps.badge_free");
      plusBadge.textContent = mt("maps.badge_plus_off");
      if (trafficBadge.getAttribute("data-static") !== "1") {
        trafficBadge.textContent = mt("maps.badge_traffic_checking");
      }
      placeBtn.textContent = mt("maps.search_place");
      placeInput.setAttribute("placeholder", mt("maps.search_placeholder"));
      placeInput.setAttribute("aria-label", mt("maps.search_place"));
      radiusLabel.firstChild && radiusLabel.firstChild.nodeType === 3
        ? (radiusLabel.firstChild.textContent = mt("maps.nearby_radius") + " ")
        : null;
      nearCamsBtn.textContent = mt("maps.nearby_cameras");
      nearPhotosBtn.textContent = mt("maps.nearby_photos");
      streetViewBtn.textContent = mt("maps.street_view_360");
      surroundBtn.textContent = mt("maps.view_surroundings");
      fromInput.setAttribute("placeholder", mt("maps.origin"));
      fromInput.setAttribute("aria-label", mt("maps.origin"));
      toInput.setAttribute("placeholder", mt("maps.destination"));
      toInput.setAttribute("aria-label", mt("maps.destination"));
      routeBtn.textContent = mt("maps.route");
      if (gpsBtn.getAttribute("data-busy") !== "1") gpsBtn.textContent = mt("maps.my_location");
      useOriginBtn.textContent = mt("maps.use_as_origin");
      shareBtn.textContent = mt("maps.share");
      copyBtn.textContent = mt("maps.copy_link");
      if (fullBtn.getAttribute("data-fs") === "1") fullBtn.textContent = mt("maps.exit_fullscreen");
      else fullBtn.textContent = mt("maps.fullscreen");
      if (status.getAttribute("data-user") !== "1") status.textContent = mt("maps.status_intro");
    }
    if (root.HAVKAR_MAP_I18N && typeof root.HAVKAR_MAP_I18N.onChange === "function") {
      root.HAVKAR_MAP_I18N.onChange(refreshMapChrome);
    }
    document.addEventListener("havkar:i18n-ready", refreshMapChrome);
    document.addEventListener("havkar:language-changed", refreshMapChrome);

    function note(text) {
      status.textContent = text || "";
      if (text) status.setAttribute("data-user", "1");
      else status.removeAttribute("data-user");
      setNote(text || "");
    }

    /* Locked destination from search/suggestion — never silently invent coords. */
    var lastDestination = null;
    var destMarker = null;

    function normalizePlace(row) {
      if (!row || typeof row !== "object") return null;
      var lat = Number(row.latitude != null ? row.latitude : row.lat);
      var lng = Number(row.longitude != null ? row.longitude : row.lng != null ? row.lng : row.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
      return {
        latitude: lat,
        longitude: lng,
        label: row.label || row.name || row.display_name || placeInput.value || mt("maps.destination"),
        city: row.city || (row.address && row.address.city) || null,
        country: row.country || (row.address && row.address.country) || null,
        type: row.type || null,
        provider: row.provider || null
      };
    }

    function geocode(q, typeahead) {
      /* Always use TomTom search proxy for map destination — never invent coords. */
      var url =
        "/api/map-tomtom-search?q=" +
        encodeURIComponent(q) +
        "&limit=" +
        (typeahead ? "8" : "8") +
        (typeahead ? "&typeahead=true" : "");
      return fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store"
      }).then(function (r) {
        return r.json();
      });
    }

    function currentCenter() {
      try {
        if (api && api.map && api.map.getCenter) {
          var c = api.map.getCenter();
          return { latitude: c.lat, longitude: c.lng };
        }
      } catch (_e) {}
      return null;
    }

    function placeDestinationMarker(place) {
      if (!place || !api || !api.map || !api.L) return;
      var L = api.L;
      try {
        if (destMarker) {
          api.map.removeLayer(destMarker);
          destMarker = null;
        }
      } catch (_e) {}
      try {
        destMarker = L.marker([place.latitude, place.longitude], {
          title: place.label || mt("maps.destination"),
          zIndexOffset: 800
        }).bindPopup(String(place.label || mt("maps.destination")));
        destMarker.addTo(api.map);
        try {
          destMarker.openPopup();
        } catch (_p) {}
      } catch (_m) {}
    }

    function applyPlace(raw, opts) {
      var options = opts || {};
      var primary = normalizePlace(raw);
      if (!primary) return false;
      lastDestination = primary;
      if (api && typeof api.setCenter === "function") {
        api.setCenter(primary.latitude, primary.longitude, 15);
      } else if (api && api.map && api.map.setView) {
        api.map.setView([primary.latitude, primary.longitude], 15);
      }
      if (api && typeof api.setMarkers === "function") {
        api.setMarkers(
          [
            {
              id: "destination",
              latitude: primary.latitude,
              longitude: primary.longitude,
              label: primary.label
            }
          ],
          { fit: true }
        );
      }
      placeDestinationMarker(primary);
      try {
        if (api && typeof api.invalidate === "function") api.invalidate();
        else if (api && api.map && api.map.invalidateSize) api.map.invalidateSize();
      } catch (_inv) {}
      placeInput.value = primary.label || placeInput.value;
      if (!options.keepSuggest) {
        suggestBox.hidden = true;
        suggestBox.innerHTML = "";
      }
      /* Prefill route destination with the locked search result. */
      if (!String(toInput.value || "").trim()) {
        toInput.value = primary.label;
      }
      toInput.setAttribute("data-havkar-dest-lat", String(primary.latitude));
      toInput.setAttribute("data-havkar-dest-lng", String(primary.longitude));
      return true;
    }

    function renderSuggestions(rows, q) {
      suggestBox.innerHTML = "";
      var list = (rows || []).map(normalizePlace).filter(Boolean);
      if (!list.length) {
        suggestBox.hidden = true;
        return [];
      }
      list.forEach(function (row) {
        var btn = el("button", { type: "button", role: "option" });
        var cityCountry = [row.city, row.country].filter(Boolean).join(", ");
        btn.textContent =
          row.label +
          (cityCountry && String(row.label).indexOf(cityCountry) === -1 ? " · " + cityCountry : "");
        btn.addEventListener("click", function () {
          if (applyPlace(row)) {
            note(mt("maps.msg_place_ready", { label: row.label }));
            refreshDestinationTools("all");
          }
        });
        suggestBox.appendChild(btn);
      });
      suggestBox.hidden = false;
      return list;
    }

    /**
     * Prefer locked search destination; otherwise use real map center with an
     * explicit notice — never invent Rome/default coords silently.
     */
    function resolveWorkingPoint(opts) {
      var options = opts || {};
      if (lastDestination && Number.isFinite(lastDestination.latitude)) {
        return {
          place: lastDestination,
          source: "destination"
        };
      }
      var c = currentCenter();
      if (c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
        if (!options.silent) note(mt("maps.msg_using_map_center"));
        return {
          place: {
            latitude: c.latitude,
            longitude: c.longitude,
            label: mt("maps.map_center"),
            from_map_center: true
          },
          source: "map_center"
        };
      }
      note(mt("maps.msg_move_search_first"));
      return null;
    }

    function openSurroundingsAtDestination(kind) {
      var resolved = resolveWorkingPoint({ silent: kind === "all" && !!lastDestination });
      if (!resolved || !resolved.place) return;
      var dest = resolved.place;
      var radius = Number(radiusSel.value) || 3;
      if (root.HAVKAR_HOTEL_SURROUNDINGS && root.HAVKAR_HOTEL_SURROUNDINGS.open) {
        root.HAVKAR_HOTEL_SURROUNDINGS.open({
          api: api,
          setNote: note,
          latitude: dest.latitude,
          longitude: dest.longitude,
          label: dest.label,
          radius_km: radius,
          focus: kind || "all"
        });
        return;
      }
      note(
        mt("maps.msg_loading_nearby", {
          kind:
            kind === "cameras"
              ? mt("maps.kind_cameras")
              : kind === "photos"
                ? mt("maps.kind_photos")
                : kind || "media"
        })
      );
      fetch(
        "/api/map-nearby-surroundings?lat=" +
          encodeURIComponent(dest.latitude) +
          "&lng=" +
          encodeURIComponent(dest.longitude) +
          "&radius_km=" +
          encodeURIComponent(radius),
        { headers: { Accept: "application/json" }, cache: "no-store" }
      )
        .then(function (r) {
          return r.json();
        })
        .then(function (body) {
          note(
            mt("maps.msg_nearby_summary", {
              cams: (body && body.camera_count) || 0,
              photos: (body && body.photo_count) || 0,
              sv:
                body && body.street_view && body.street_view.interactive_360
                  ? mt("maps.sv_on")
                  : mt("maps.sv_off_near")
            })
          );
        })
        .catch(function () {
          note(mt("maps.msg_nearby_fail"));
        });
    }

    function openLiveCamerasLayer() {
      try {
        if (
          root.HAVKAR_MAP_LIVE_LAYERS &&
          typeof root.HAVKAR_MAP_LIVE_LAYERS.enableLiveCameras === "function"
        ) {
          root.HAVKAR_MAP_LIVE_LAYERS.enableLiveCameras();
        }
      } catch (_e) {}
    }

    function refreshDestinationTools(kind) {
      /* After a new destination is locked, nearby/360/routing origin from that place. */
      if (!lastDestination) return;
      if (kind === "streetview" || kind === "all") {
        openSurroundingsAtDestination(kind || "all");
      }
    }

    var suggestTimer = null;
    placeInput.addEventListener("input", function () {
      var q = String(placeInput.value || "").trim();
      clearTimeout(suggestTimer);
      if (q.length < 2) {
        suggestBox.hidden = true;
        suggestBox.innerHTML = "";
        return;
      }
      suggestTimer = setTimeout(function () {
        geocode(q, true)
          .then(function (geo) {
            if (geo && geo.error === "tomtom_not_configured") {
              note(mt("maps.msg_tomtom_unavailable"));
              return;
            }
            renderSuggestions((geo && geo.results) || [], q);
          })
          .catch(function () {
            note(mt("maps.msg_search_failed"));
          });
      }, 280);
    });

    nearCamsBtn.addEventListener("click", function () {
      /* Keep nearby + global live-camera capability reachable without a prior search. */
      openSurroundingsAtDestination("cameras");
      openLiveCamerasLayer();
    });
    nearPhotosBtn.addEventListener("click", function () {
      openSurroundingsAtDestination("photos");
    });
    streetViewBtn.addEventListener("click", function () {
      var resolved = resolveWorkingPoint();
      if (!resolved || !resolved.place) return;
      var dest = resolved.place;
      var qs =
        "?lat=" +
        encodeURIComponent(dest.latitude) +
        "&lng=" +
        encodeURIComponent(dest.longitude) +
        "&radius_m=50&expand=1&provider=auto";
      fetch("/api/map-street-view" + qs, { headers: { Accept: "application/json" } })
        .then(function (r) {
          return r.json();
        })
        .then(function (body) {
          if (body && body.interactive_360) {
            note(
              mt("maps.msg_interactive_360", {
                provider: body.provider || "provider",
                distance:
                  body.distance_m != null ? " · " + body.distance_m + " m" : ""
              })
            );
          } else {
            var msg =
              (body && (body.user_message || body.reason)) || mt("maps.msg_no_360");
            if (/HAVKAR_|MAPILLARY_ACCESS|GOOGLE_MAPS/i.test(String(msg))) {
              msg = mt("maps.msg_no_360");
            }
            note(msg);
          }
          openSurroundingsAtDestination("streetview");
        })
        .catch(function () {
          note(mt("maps.msg_sv_unavailable"));
          openSurroundingsAtDestination("streetview");
        });
    });
    surroundBtn.addEventListener("click", function () {
      openSurroundingsAtDestination("all");
    });

    function parseLatLngQuery(q) {
      var raw = String(q || "").trim();
      var m = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
      if (!m) return null;
      var lat = Number(m[1]);
      var lng = Number(m[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
      return {
        ok: true,
        provider: "device_gps",
        primary: {
          latitude: lat,
          longitude: lng,
          label: "My GPS (" + lat.toFixed(5) + ", " + lng.toFixed(5) + ")"
        }
      };
    }

    function resolvePlace(q) {
      var local = parseLatLngQuery(q);
      if (local) return Promise.resolve(local);
      return geocode(q, false);
    }

    function gpsErrorMessage(err) {
      var code = err && typeof err.code === "number" ? err.code : null;
      if (!navigator.geolocation) {
        return "Geolocation is not supported in this browser. Use place search for origin/destination — the map stays usable.";
      }
      if (code === 1) {
        return mt("maps.msg_gps_denied");
      }
      if (code === 2) {
        return "GPS unavailable (device location off or no signal). Turn on Location/GPS, move near a window if indoors, then try again.";
      }
      if (code === 3) {
        return "Location request timed out. Wait for a GPS lock outdoors, then try My location again.";
      }
      return "Could not read your location. Check permission and GPS, then try again. The app continues without GPS.";
    }

    function placeGpsOnMap(lat, lng, accuracy) {
      if (!api || !api.map || !api.L) return;
      var L = api.L;
      if (!gpsLayer) {
        gpsLayer = L.layerGroup().addTo(api.map);
      } else {
        gpsLayer.clearLayers();
      }
      var accTxt = Number.isFinite(accuracy)
        ? "<br>Accuracy ≈ " + Math.round(accuracy) + " m"
        : "";
      var icon = L.divIcon({
        className: "havkar-gps-marker",
        html: '<span class="havkar-gps-dot" title="Your GPS location"></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });
      var marker = L.marker([lat, lng], { icon: icon, zIndexOffset: 1200, keyboard: true }).bindPopup(
        "<strong>Your location</strong>" +
          accTxt +
          "<br><small>Shown only on your device. Not uploaded to HAVKAR servers.</small>"
      );
      gpsLayer.addLayer(marker);
      if (Number.isFinite(accuracy) && accuracy > 0) {
        gpsLayer.addLayer(
          L.circle([lat, lng], {
            radius: Math.min(Math.max(accuracy, 10), 2500),
            color: "#1b5e20",
            weight: 2,
            fillColor: "#66bb6a",
            fillOpacity: 0.18,
            interactive: false
          })
        );
      }
      var zoom = 15;
      try {
        zoom = Math.max(api.map.getZoom() || 14, 15);
      } catch (_z) {}
      api.map.setView([lat, lng], zoom);
      try {
        marker.openPopup();
      } catch (_p) {}
    }

    function applyGpsAsOrigin(lat, lng, accuracy) {
      lastGps = {
        latitude: lat,
        longitude: lng,
        accuracy: accuracy,
        label: "My GPS (" + Number(lat).toFixed(5) + ", " + Number(lng).toFixed(5) + ")"
      };
      fromInput.value = Number(lat).toFixed(6) + ", " + Number(lng).toFixed(6);
      fromInput.setAttribute("data-havkar-gps-origin", "1");
      useOriginBtn.hidden = false;
      useOriginBtn.disabled = false;
      useOriginBtn.classList.add("primary");
    }

    function formatPublicClock(iso) {
      if (!iso) return "";
      try {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return "";
        return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      } catch (_e) {
        return "";
      }
    }

    function refreshTrafficBadge() {
      return fetch("/api/map-traffic", { headers: { Accept: "application/json" }, cache: "no-store" })
        .then(function (r) {
          return r.json();
        })
        .then(function (body) {
          trafficBadge.setAttribute("data-static", "1");
          if (body && body.available) {
            var clock = formatPublicClock(body.last_updated || body.fetched_at || "");
            trafficBadge.textContent =
              mt("maps.badge_traffic_on") + (clock ? " · " + clock : "");
          } else {
            trafficBadge.textContent = mt("maps.badge_traffic_off");
          }
        })
        .catch(function () {
          trafficBadge.setAttribute("data-static", "1");
          trafficBadge.textContent = mt("maps.badge_traffic_off");
        });
    }

    function refreshMapsPlus() {
      return fetch("/api/map-maps-plus-status", { headers: { Accept: "application/json" } })
        .then(function (r) {
          return r.json();
        })
        .then(function (body) {
          var p = body && body.product ? body.product : null;
          if (!p) return;
          /* Keep product name as returned; localize sales-OFF chrome only. */
          plusBadge.textContent = mt("maps.badge_plus_off");
        })
        .catch(function () {});
    }

    placeBtn.addEventListener("click", function () {
      var q = String(placeInput.value || "").trim();
      if (q.length < 2) {
        note(mt("maps.msg_enter_place"));
        return;
      }
      note(mt("maps.msg_searching", { q: q }));
      resolvePlace(q)
        .then(function (geo) {
          if (geo && geo.error === "tomtom_not_configured") {
            note(mt("maps.msg_tomtom_unavailable"));
            return;
          }
          if (!geo || !geo.ok || !geo.primary) {
            renderSuggestions((geo && geo.results) || [], q);
            note(mt("maps.msg_no_match"));
            return;
          }
          var rows = (geo.results && geo.results.length ? geo.results : [geo.primary])
            .map(normalizePlace)
            .filter(Boolean);
          if (!rows.length) {
            note(mt("maps.msg_no_match"));
            return;
          }
          applyPlace(rows[0], { keepSuggest: rows.length > 1 });
          if (rows.length > 1) {
            renderSuggestions(rows, q);
            note(mt("maps.msg_multi_matches"));
          } else {
            note(mt("maps.msg_place_ready", { label: rows[0].label }));
          }
          refreshDestinationTools("all");
        })
        .catch(function () {
          note(mt("maps.msg_search_failed"));
        });
    });

    routeBtn.addEventListener("click", function () {
      var fromQ = String(fromInput.value || "").trim();
      var toQ = String(toInput.value || "").trim();
      if (fromQ.length < 2 || toQ.length < 2) {
        note(mt("maps.msg_enter_od"));
        return;
      }
      note(mt("maps.msg_routing", { from: fromQ, to: toQ }));
      Promise.all([resolvePlace(fromQ), resolvePlace(toQ)]).then(function (pair) {
        var a = pair[0] && pair[0].primary;
        var b = pair[1] && pair[1].primary;
        if (!a || !b) {
          note(mt("maps.msg_resolve_fail"));
          return;
        }
        if (api && api.clearPins) api.clearPins();
        if (api && api.clearRoute) api.clearRoute();
        if (api && api.setMarkers) {
          api.setMarkers(
            [
              { id: "origin", latitude: a.latitude, longitude: a.longitude, label: "Origin: " + (a.label || fromQ) },
              { id: "dest", latitude: b.latitude, longitude: b.longitude, label: "Destination: " + (b.label || toQ) }
            ],
            { fit: true }
          );
        }
        function finishRoute(route) {
          if (!route || !route.ok) {
            note(mt("maps.msg_markers_no_route"));
            return;
          }
          var km = (Number(route.distance_m) / 1000).toFixed(1);
          var mins = Math.round(Number(route.duration_s) / 60);
          var delay = Number(route.traffic_delay_s);
          var delayTxt =
            Number.isFinite(delay) && delay > 0
              ? " · traffic delay ~" + Math.round(delay / 60) + " min"
              : "";
          note(
            "Route (" +
              (route.provider || "routing") +
              "): ~" +
              km +
              " km · ~" +
              mins +
              " min" +
              delayTxt +
              (route.last_updated
                ? " · " + (formatPublicClock(route.last_updated) || "")
                : "") +
              " · free · not a ticket booking"
          );
        }
        if (api && typeof api.requestRoute === "function") {
          if (api.setCenter) api.setCenter(a.latitude, a.longitude);
          return api.requestRoute(b.latitude, b.longitude, "driving").then(finishRoute);
        }
        return fetch(
          "/api/map-tomtom-routing?fromLat=" +
            encodeURIComponent(a.latitude) +
            "&fromLng=" +
            encodeURIComponent(a.longitude) +
            "&toLat=" +
            encodeURIComponent(b.latitude) +
            "&toLng=" +
            encodeURIComponent(b.longitude) +
            "&profile=driving",
          { headers: { Accept: "application/json" }, cache: "no-store" }
        )
          .then(function (r) {
            return r.json();
          })
          .then(function (route) {
            if (route && route.ok && route.geometry && route.geometry.coordinates && api && api.L && api.map) {
              var latlngs = route.geometry.coordinates.map(function (c) {
                return [c[1], c[0]];
              });
              if (!api._proRouteLayer) api._proRouteLayer = api.L.layerGroup().addTo(api.map);
              api._proRouteLayer.clearLayers();
              var line = api.L.polyline(latlngs, { color: "#1b5e20", weight: 5, opacity: 0.9 });
              api._proRouteLayer.addLayer(line);
              try {
                api.map.fitBounds(line.getBounds(), { padding: [28, 28] });
              } catch (_e) {}
            }
            finishRoute(route);
          });
      });
    });

    useOriginBtn.addEventListener("click", function () {
      if (!lastGps) {
        note(mt("maps.msg_gps_first"));
        return;
      }
      applyGpsAsOrigin(lastGps.latitude, lastGps.longitude, lastGps.accuracy);
      note(
        "Origin set to your GPS position (" +
          Number(lastGps.latitude).toFixed(5) +
          ", " +
          Number(lastGps.longitude).toFixed(5) +
          "). Enter a destination and tap Route."
      );
    });

    gpsBtn.addEventListener("click", function () {
      if (gpsBtn.getAttribute("aria-busy") === "true") return;
      note(mt("maps.msg_requesting_gps"));
      gpsBtn.setAttribute("aria-busy", "true");
      gpsBtn.disabled = true;
      gpsBtn.setAttribute("data-busy", "1"); gpsBtn.textContent = mt("maps.locating");

      function finishGpsUi() {
        gpsBtn.removeAttribute("aria-busy");
        gpsBtn.disabled = false;
        gpsBtn.removeAttribute("data-busy"); gpsBtn.textContent = mt("maps.my_location");
      }

      function onPos(lat, lng, accuracy) {
        placeGpsOnMap(lat, lng, accuracy);
        applyGpsAsOrigin(lat, lng, accuracy);
        note(
          "GPS ready · " +
            Number(lat).toFixed(5) +
            ", " +
            Number(lng).toFixed(5) +
            (Number.isFinite(accuracy) ? " · accuracy ≈ " + Math.round(accuracy) + " m" : "") +
            ". Origin filled — tap Use as origin anytime. Location stays on your device (not uploaded to HAVKAR)."
        );
      }

      if (!navigator.geolocation) {
        note(gpsErrorMessage(null));
        finishGpsUi();
        return;
      }

      try {
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            try {
              onPos(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
            } catch (_e) {
              note("Location received but the map could not update. You can still type an origin.");
            }
            finishGpsUi();
          },
          function (err) {
            note(gpsErrorMessage(err));
            finishGpsUi();
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      } catch (_callErr) {
        note(gpsErrorMessage(null));
        finishGpsUi();
      }
    });

    function buildShareUrl(c) {
      var payload =
        root.HAVKAR_MAP && root.HAVKAR_MAP.mapsSharePayload
          ? root.HAVKAR_MAP.mapsSharePayload(c.latitude, c.longitude, c.label)
          : null;
      if (payload && (payload.url || payload.text)) return payload.url || payload.text;
      return (
        "https://www.openstreetmap.org/?mlat=" +
        c.latitude +
        "&mlon=" +
        c.longitude +
        "#map=14/" +
        c.latitude +
        "/" +
        c.longitude
      );
    }

    shareBtn.addEventListener("click", function () {
      var c = centerOf();
      var url = buildShareUrl(c);
      if (root.HAVKAR_MAP && root.HAVKAR_MAP.nativeShareLocation) {
        root.HAVKAR_MAP.nativeShareLocation(c.latitude, c.longitude, c.label).then(function (res) {
          note(mt("maps.msg_share_ok"));
          if (!(res && (res.shared || res.url)) && navigator.clipboard && url) {
            navigator.clipboard.writeText(url).then(function () {
              note(mt("maps.msg_copy_ok"));
            });
          }
        });
        return;
      }
      if (navigator.share) {
        navigator
          .share({ title: "HAVKAR", text: c.label || "Map", url: url })
          .then(function () {
            note(mt("maps.msg_share_ok"));
          })
          .catch(function () {
            if (navigator.clipboard && url) {
              navigator.clipboard.writeText(url).then(function () {
                note(mt("maps.msg_copy_ok"));
              });
            } else {
              note(mt("maps.msg_copy_ok"));
            }
          });
        return;
      }
      if (navigator.clipboard && url) {
        navigator.clipboard.writeText(url).then(function () {
          note(mt("maps.msg_copy_ok"));
        });
        return;
      }
      note(url || mt("maps.msg_copy_ok"));
    });

    copyBtn.addEventListener("click", function () {
      var c = centerOf();
      var text = buildShareUrl(c);
      if (navigator.clipboard && navigator.clipboard.writeText && text) {
        navigator.clipboard.writeText(text).then(
          function () {
            note(mt("maps.msg_copy_ok"));
          },
          function () {
            note(text);
          }
        );
      } else {
        note(text || mt("maps.msg_copy_ok"));
      }
    });

    fullBtn.addEventListener("click", function () {
      var shell = mapShell || (mapHost && mapHost.parentElement);
      if (!shell) {
        note("Fullscreen host unavailable.");
        return;
      }
      shell.classList.add("havkar-map-shell");
      var on = shell.classList.toggle("is-fullscreen");
      fullBtn.setAttribute("data-fs", on ? "1" : "0"); fullBtn.textContent = on ? mt("maps.exit_fullscreen") : mt("maps.fullscreen");
      if (api && api.invalidate) setTimeout(function () { api.invalidate(); }, 120);
      else if (api && api.map && api.map.invalidateSize) {
        setTimeout(function () {
          api.map.invalidateSize();
        }, 120);
      }
      note(on ? mt("maps.msg_fullscreen_on") : mt("maps.msg_fullscreen_off"));
    });

    zoomInBtn.addEventListener("click", function () {
      if (api && api.map && api.map.zoomIn) api.map.zoomIn();
    });
    zoomOutBtn.addEventListener("click", function () {
      if (api && api.map && api.map.zoomOut) api.map.zoomOut();
    });

    if (mapHost || mapShell) {
      var shell = mapShell || mapHost.parentElement;
      if (shell) {
        shell.classList.add("havkar-map-shell");
        var fab = el("div", { className: "havkar-map-fab-zoom" });
        var fabIn = el("button", { type: "button", "aria-label": "Zoom in" }, "+");
        var fabOut = el("button", { type: "button", "aria-label": "Zoom out" }, "−");
        fabIn.addEventListener("click", function () {
          if (api && api.map && api.map.zoomIn) api.map.zoomIn();
        });
        fabOut.addEventListener("click", function () {
          if (api && api.map && api.map.zoomOut) api.map.zoomOut();
        });
        fab.appendChild(fabIn);
        fab.appendChild(fabOut);
        shell.appendChild(fab);
      }
    }

    refreshTrafficBadge();
    refreshMapsPlus();
    setInterval(refreshTrafficBadge, 60000);

    return {
      ok: true,
      note: note,
      inputs: { place: placeInput, from: fromInput, to: toInput },
      getLastGps: function () {
        return lastGps ? Object.assign({}, lastGps) : null;
      }
    };
  }

  root.HAVKAR_MAP_PRO = { attach: attach };
})(typeof globalThis !== "undefined" ? globalThis : this);
