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
      placeholder: "Search place or address worldwide",
      autocomplete: "off",
      "aria-label": "Search place or address"
    });
    var placeBtn = el("button", { type: "button", className: "primary", "data-pro": "place-go" }, "Search place");
    searchRow.appendChild(placeInput);
    searchRow.appendChild(placeBtn);
    host.appendChild(searchRow);

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
    var gpsBtn = el("button", { type: "button", "data-pro": "gps" }, "My location");
    var shareBtn = el("button", { type: "button", "data-pro": "share" }, "Share");
    var copyBtn = el("button", { type: "button", "data-pro": "copy" }, "Copy link");
    var fullBtn = el("button", { type: "button", "data-pro": "fullscreen" }, "Fullscreen");
    var zoomInBtn = el("button", { type: "button", "data-pro": "zoom-in", "aria-label": "Zoom in" }, "+");
    var zoomOutBtn = el("button", { type: "button", "data-pro": "zoom-out", "aria-label": "Zoom out" }, "−");
    [gpsBtn, shareBtn, copyBtn, fullBtn, zoomInBtn, zoomOutBtn].forEach(function (b) {
      actions.appendChild(b);
    });
    host.appendChild(actions);

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

    function geocode(q) {
      if (root.HAVKAR_MAP && root.HAVKAR_MAP.geocode) {
        return root.HAVKAR_MAP.geocode(q);
      }
      return fetch("/api/map-tomtom-search?q=" + encodeURIComponent(q) + "&limit=5", {
        headers: { Accept: "application/json" },
        cache: "no-store"
      }).then(function (r) {
        return r.json();
      });
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
      geocode(q).then(function (geo) {
        if (!geo || !geo.ok || !geo.primary) {
          note("No matching place found. Coordinates are never invented.");
          return;
        }
        if (api && api.setCenter) {
          api.setCenter(geo.primary.latitude, geo.primary.longitude, 13);
        } else if (api && api.map) {
          api.map.setView([geo.primary.latitude, geo.primary.longitude], 13);
        }
        if (api && api.setMarkers) {
          api.setMarkers(
            [
              {
                id: "place",
                latitude: geo.primary.latitude,
                longitude: geo.primary.longitude,
                label: geo.primary.label || q
              }
            ],
            { fit: true }
          );
        }
        note(
          "Place: " +
            (geo.primary.label || q) +
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
      Promise.all([geocode(fromQ), geocode(toQ)]).then(function (pair) {
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

    gpsBtn.addEventListener("click", function () {
      note("Requesting your location…");
      function onPos(lat, lng, accuracy) {
        if (api && api.setCenter) api.setCenter(lat, lng, 14);
        else if (api && api.map) api.map.setView([lat, lng], 14);
        note(
          "GPS location set" +
            (Number.isFinite(accuracy) ? " · accuracy ~" + Math.round(accuracy) + " m" : "") +
            ". Permission was granted by you."
        );
      }
      if (api && typeof api.requestGps === "function") {
        api
          .requestGps()
          .then(function (pos) {
            onPos(pos.latitude, pos.longitude, pos.accuracy);
          })
          .catch(function () {
            note("Location permission denied or unavailable.");
          });
        return;
      }
      if (!navigator.geolocation) {
        note("Geolocation is not available on this device.");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          onPos(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        },
        function () {
          note("Location permission denied or unavailable.");
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
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
      inputs: { place: placeInput, from: fromInput, to: toInput }
    };
  }

  root.HAVKAR_MAP_PRO = { attach: attach };
})(typeof globalThis !== "undefined" ? globalThis : this);
