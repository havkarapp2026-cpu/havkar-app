/**
 * Professional HAVKAR map toolbar for Tickets + Accommodation.
 * Uses real TomTom proxies only. No fake buttons. Maps Plus stays sales-off.
 */
(function (root) {
  "use strict";

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

    var badges = el("div", { className: "havkar-map-pro-badges" });
    badges.appendChild(el("span", { className: "havkar-map-pro-badge", "data-kind": "free" }, "Maps free for all users"));
    var trafficBadge = el("span", { className: "havkar-map-pro-badge", "data-kind": "traffic" }, "Traffic: checking…");
    badges.appendChild(trafficBadge);
    var plusBadge = el("span", { className: "havkar-map-pro-badge", "data-kind": "plus" }, "Maps Plus €4.99 · sales OFF");
    badges.appendChild(plusBadge);
    host.appendChild(badges);

    var searchRow = el("div", { className: "havkar-map-pro-search" });
    var placeInput = el("input", {
      type: "search",
      "data-pro": "place",
      placeholder: "Search hotel, street, city or address worldwide",
      autocomplete: "off",
      "aria-label": "Search place or address"
    });
    var placeBtn = el("button", { type: "button", className: "primary", "data-pro": "place-go" }, "Search place");
    searchRow.appendChild(placeInput);
    searchRow.appendChild(placeBtn);
    host.appendChild(searchRow);
    var suggestBox = el("div", {
      className: "havkar-map-pro-suggest",
      "data-pro": "suggest",
      hidden: "hidden",
      role: "listbox",
      "aria-label": "Place suggestions"
    });
    host.appendChild(suggestBox);

    var nearRow = el("div", { className: "havkar-map-pro-near" });
    var radiusLabel = el("label", null, "Nearby radius ");
    var radiusSel = el("select", { "data-pro": "radius", "aria-label": "Nearby search radius" });
    [1, 2, 3, 5, 10, 15].forEach(function (n) {
      var o = el("option", { value: String(n) }, String(n) + " km");
      if (n === 3) o.selected = true;
      radiusSel.appendChild(o);
    });
    radiusLabel.appendChild(radiusSel);
    var nearCamsBtn = el("button", { type: "button", "data-pro": "near-cams" }, "Nearby cameras");
    var nearPhotosBtn = el("button", { type: "button", "data-pro": "near-photos" }, "Nearby photos");
    var streetViewBtn = el("button", { type: "button", "data-pro": "street-view" }, "360° Street View");
    var surroundBtn = el("button", { type: "button", className: "primary", "data-pro": "surroundings" }, "View surroundings");
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
      placeholder: "Origin",
      autocomplete: "off",
      "aria-label": "Origin"
    });
    var toInput = el("input", {
      type: "search",
      "data-pro": "to",
      placeholder: "Destination",
      autocomplete: "off",
      "aria-label": "Destination"
    });
    var routeBtn = el("button", { type: "button", className: "primary", "data-pro": "route-go" }, "Route");
    routeRow.appendChild(fromInput);
    routeRow.appendChild(toInput);
    routeRow.appendChild(routeBtn);
    host.appendChild(routeRow);

    var actions = el("div", { className: "havkar-map-pro-actions", role: "group", "aria-label": "Map tools" });
    var gpsBtn = el("button", { type: "button", "data-pro": "gps", "aria-label": "My location — requests browser GPS permission" }, "My location");
    var useOriginBtn = el(
      "button",
      {
        type: "button",
        "data-pro": "gps-origin",
        hidden: "hidden",
        disabled: "disabled",
        "aria-label": "Use my GPS position as route origin"
      },
      "Use as origin"
    );
    var shareBtn = el("button", { type: "button", "data-pro": "share" }, "Share");
    var copyBtn = el("button", { type: "button", "data-pro": "copy" }, "Copy link");
    var fullBtn = el("button", { type: "button", "data-pro": "fullscreen" }, "Fullscreen");
    var zoomInBtn = el("button", { type: "button", "data-pro": "zoom-in", "aria-label": "Zoom in" }, "+");
    var zoomOutBtn = el("button", { type: "button", "data-pro": "zoom-out", "aria-label": "Zoom out" }, "−");
    [gpsBtn, useOriginBtn, shareBtn, copyBtn, fullBtn, zoomInBtn, zoomOutBtn].forEach(function (b) {
      actions.appendChild(b);
    });
    host.appendChild(actions);

    /* Device GPS only — never POST/upload coordinates to HAVKAR without consent. */
    var lastGps = null;
    var gpsLayer = null;

    var status = el("p", { className: "havkar-map-pro-status", role: "status", "data-pro": "status" });
    status.textContent =
      "Street / satellite / hybrid · live traffic when configured · cameras & rain only from licensed sources. All active map tools are free.";
    host.appendChild(status);

    function note(text) {
      status.textContent = text || "";
      setNote(text || "");
    }

    function centerOf() {
      try {
        if (api && api.map && api.map.getCenter) {
          var c = api.map.getCenter();
          return { latitude: c.lat, longitude: c.lng, label: "Map center" };
        }
      } catch (_e) {}
      return { latitude: 41.9028, longitude: 12.4964, label: "Map" };
    }

    function geocode(q, typeahead) {
      var url =
        "/api/map-tomtom-search?q=" +
        encodeURIComponent(q) +
        "&limit=" +
        (typeahead ? "8" : "5") +
        (typeahead ? "&typeahead=true" : "");
      if (!typeahead && root.HAVKAR_MAP && root.HAVKAR_MAP.geocode) {
        return root.HAVKAR_MAP.geocode(q);
      }
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

    function applyPlace(primary) {
      if (!primary) return;
      if (api && api.setCenter) {
        api.setCenter(primary.latitude, primary.longitude, 14);
      } else if (api && api.map) {
        api.map.setView([primary.latitude, primary.longitude], 14);
      }
      if (api && api.setMarkers) {
        api.setMarkers(
          [
            {
              id: "place",
              latitude: primary.latitude,
              longitude: primary.longitude,
              label: primary.label || "Place"
            }
          ],
          { fit: true }
        );
      }
      placeInput.value = primary.label || placeInput.value;
      suggestBox.hidden = true;
      suggestBox.innerHTML = "";
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
        geocode(q, true).then(function (geo) {
          suggestBox.innerHTML = "";
          var rows = (geo && geo.results) || [];
          if (!rows.length) {
            suggestBox.hidden = true;
            return;
          }
          rows.forEach(function (row) {
            var btn = el("button", { type: "button", role: "option" });
            var cityCountry = [row.city, row.country || (row.address && row.address.country)]
              .filter(Boolean)
              .join(", ");
            btn.textContent = row.label + (cityCountry && String(row.label).indexOf(cityCountry) === -1 ? " · " + cityCountry : "");
            btn.addEventListener("click", function () {
              applyPlace(row);
              note(
                "Place: " +
                  (row.label || "") +
                  (row.city ? " · " + row.city : "") +
                  (row.country ? ", " + row.country : "") +
                  " · TomTom autocomplete"
              );
            });
            suggestBox.appendChild(btn);
          });
          suggestBox.hidden = false;
        });
      }, 280);
    });

    function openSurroundingsAtCenter(kind) {
      var c = currentCenter();
      if (!c) {
        note("Move or search the map to a place first.");
        return;
      }
      var radius = Number(radiusSel.value) || 3;
      if (root.HAVKAR_HOTEL_SURROUNDINGS && root.HAVKAR_HOTEL_SURROUNDINGS.open) {
        root.HAVKAR_HOTEL_SURROUNDINGS.open({
          api: api,
          setNote: note,
          latitude: c.latitude,
          longitude: c.longitude,
          label: "Map center",
          radius_km: radius
        });
        return;
      }
      note("Loading nearby " + (kind || "media") + "…");
      fetch(
        "/api/map-nearby-surroundings?lat=" +
          encodeURIComponent(c.latitude) +
          "&lng=" +
          encodeURIComponent(c.longitude) +
          "&radius_km=" +
          encodeURIComponent(radius),
        { headers: { Accept: "application/json" }, cache: "no-store" }
      )
        .then(function (r) {
          return r.json();
        })
        .then(function (body) {
          note(
            "Nearby · cameras " +
              ((body && body.camera_count) || 0) +
              " · photos " +
              ((body && body.photo_count) || 0) +
              " · 360° " +
              (body && body.street_view && body.street_view.interactive_360 ? "ON" : "unavailable") +
              (body && body.message ? " · " + body.message : "")
          );
        })
        .catch(function () {
          note("Nearby lookup failed.");
        });
    }

    nearCamsBtn.addEventListener("click", function () {
      openSurroundingsAtCenter("cameras");
    });
    nearPhotosBtn.addEventListener("click", function () {
      openSurroundingsAtCenter("photos");
    });
    streetViewBtn.addEventListener("click", function () {
      var c = map && map.getCenter && map.getCenter();
      var qs =
        c && Number.isFinite(c.lat) && Number.isFinite(c.lng)
          ? "?lat=" +
            encodeURIComponent(c.lat) +
            "&lng=" +
            encodeURIComponent(c.lng) +
            "&radius_m=50&provider=auto"
          : "";
      fetch("/api/map-street-view" + qs, { headers: { Accept: "application/json" } })
        .then(function (r) {
          return r.json();
        })
        .then(function (body) {
          if (body && body.interactive_360) {
            note(
              "Interactive 360° via " +
                (body.provider || "provider") +
                (body.distance_m != null ? " · " + body.distance_m + " m" : "") +
                " · rotate + move when coverage exists."
            );
          } else {
            note(
              (body && body.reason) ||
                "360° unavailable. Add free HAVKAR_MAPILLARY_ACCESS_TOKEN or Owner-approved Google Embed key — no fake panoramas."
            );
          }
          openSurroundingsAtCenter("streetview");
        })
        .catch(function () {
          note("Street View status unavailable.");
          openSurroundingsAtCenter("streetview");
        });
    });
    surroundBtn.addEventListener("click", function () {
      openSurroundingsAtCenter("all");
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
      return geocode(q);
    }

    function gpsErrorMessage(err) {
      var code = err && typeof err.code === "number" ? err.code : null;
      if (!navigator.geolocation) {
        return "Geolocation is not supported in this browser. Use place search for origin/destination — the map stays usable.";
      }
      if (code === 1) {
        return "Location permission denied. Allow location for this site in browser settings, then tap My location again. Map and search still work without GPS.";
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

    function refreshTrafficBadge() {
      return fetch("/api/map-traffic", { headers: { Accept: "application/json" }, cache: "no-store" })
        .then(function (r) {
          return r.json();
        })
        .then(function (body) {
          if (body && body.available) {
            var ts = body.last_updated || body.fetched_at || "";
            trafficBadge.textContent = "Traffic live · updated " + (ts || "now");
          } else {
            trafficBadge.textContent = "Traffic awaiting key";
          }
        })
        .catch(function () {
          trafficBadge.textContent = "Traffic status unavailable";
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
          plusBadge.textContent =
            p.display_name +
            " €" +
            Number(p.price_monthly).toFixed(2) +
            " · " +
            p.trial_days +
            "-day trial planned · sales OFF";
        })
        .catch(function () {});
    }

    placeBtn.addEventListener("click", function () {
      var q = String(placeInput.value || "").trim();
      if (q.length < 2) {
        note("Enter a place or address to search.");
        return;
      }
      note("Searching “" + q + "”…");
      resolvePlace(q).then(function (geo) {
        if (!geo || !geo.ok || !geo.primary) {
          note("No matching place found. Coordinates are never invented.");
          return;
        }
        applyPlace(geo.primary);
        note(
          "Place: " +
            (geo.primary.label || q) +
            (geo.primary.city ? " · " + geo.primary.city : "") +
            (geo.primary.country ? ", " + geo.primary.country : "") +
            " · provider " +
            (geo.provider || "search") +
            (geo.last_updated ? " · " + geo.last_updated : "")
        );
      });
    });

    routeBtn.addEventListener("click", function () {
      var fromQ = String(fromInput.value || "").trim();
      var toQ = String(toInput.value || "").trim();
      if (fromQ.length < 2 || toQ.length < 2) {
        note("Enter both origin and destination.");
        return;
      }
      note("Routing " + fromQ + " → " + toQ + "…");
      Promise.all([resolvePlace(fromQ), resolvePlace(toQ)]).then(function (pair) {
        var a = pair[0] && pair[0].primary;
        var b = pair[1] && pair[1].primary;
        if (!a || !b) {
          note("Could not resolve origin or destination. No invented coordinates.");
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
            note("Markers placed. Live route unavailable right now.");
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
              (route.last_updated ? " · updated " + route.last_updated : "") +
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
        note("Get your GPS location first, then use it as route origin.");
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
      note("Requesting browser location permission…");
      gpsBtn.setAttribute("aria-busy", "true");
      gpsBtn.disabled = true;
      gpsBtn.textContent = "Locating…";

      function finishGpsUi() {
        gpsBtn.removeAttribute("aria-busy");
        gpsBtn.disabled = false;
        gpsBtn.textContent = "My location";
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

    shareBtn.addEventListener("click", function () {
      var c = centerOf();
      if (root.HAVKAR_MAP && root.HAVKAR_MAP.nativeShareLocation) {
        root.HAVKAR_MAP.nativeShareLocation(c.latitude, c.longitude, c.label).then(function (res) {
          note(res && res.shared ? "Location shared." : res && res.url ? "Share link ready." : "Share unavailable.");
        });
        return;
      }
      note("Share unavailable on this device.");
    });

    copyBtn.addEventListener("click", function () {
      var c = centerOf();
      var payload =
        root.HAVKAR_MAP && root.HAVKAR_MAP.mapsSharePayload
          ? root.HAVKAR_MAP.mapsSharePayload(c.latitude, c.longitude, c.label)
          : {
              url:
                "https://www.openstreetmap.org/?mlat=" +
                c.latitude +
                "&mlon=" +
                c.longitude +
                "#map=14/" +
                c.latitude +
                "/" +
                c.longitude
            };
      var text = (payload && (payload.url || payload.text)) || "";
      if (navigator.clipboard && navigator.clipboard.writeText && text) {
        navigator.clipboard.writeText(text).then(function () {
          note("Location link copied.");
        });
      } else {
        note(text || "Copy unavailable.");
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
      fullBtn.textContent = on ? "Exit fullscreen" : "Fullscreen";
      if (api && api.invalidate) setTimeout(function () { api.invalidate(); }, 120);
      else if (api && api.map && api.map.invalidateSize) {
        setTimeout(function () {
          api.map.invalidateSize();
        }, 120);
      }
      note(on ? "Map fullscreen." : "Exited fullscreen.");
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
