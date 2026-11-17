/**
 * Lightweight map panel mount for Buy & Sell / Jobs / Services / Delivery / Ads.
 * Uses HAVKAR_MAP + Nominatim geocode. Never fabricates markers without coordinates.
 */
(function (root) {
  "use strict";

  function t(en) {
    try {
      var lang =
        (root.HAVKAR_I18N && root.HAVKAR_I18N.getLanguage && root.HAVKAR_I18N.getLanguage()) ||
        localStorage.getItem("havkar_language") ||
        "en";
      var pack =
        root.HAVKAR_UI_I18N21 && root.HAVKAR_UI_I18N21.pack
          ? root.HAVKAR_UI_I18N21.pack(lang)
          : {};
      return pack[en] || en;
    } catch (_e) {
      return en;
    }
  }

  function countryOptions() {
    var list =
      (root.HAVKAR_COUNTRIES && root.HAVKAR_COUNTRIES.list) ||
      (root.HAVKAR_COUNTRIES && root.HAVKAR_COUNTRIES.COUNTRIES) ||
      [];
    if (!Array.isArray(list) || !list.length) {
      if (root.HAVKAR_COUNTRIES && typeof root.HAVKAR_COUNTRIES.getAll === "function") {
        list = root.HAVKAR_COUNTRIES.getAll();
      }
    }
    return Array.isArray(list) ? list : [];
  }

  function mount(options) {
    var opts = options || {};
    var host =
      typeof opts.container === "string"
        ? document.getElementById(opts.container)
        : opts.container;
    if (!host || !root.HAVKAR_MAP) {
      return Promise.reject(new Error("map_panel_unavailable"));
    }

    if (root.HAVKAR_MAP.ensurePlatformCss) root.HAVKAR_MAP.ensurePlatformCss();

    host.innerHTML = "";
    host.classList.add("havkar-module-map");
    host.style.display = "grid";
    host.style.gap = "8px";

    var tools = document.createElement("div");
    tools.className = "havkar-map-toolbar";

    var country = document.createElement("select");
    country.setAttribute("aria-label", t("Country"));
    country.innerHTML = '<option value="">' + t("Country") + "</option>";
    countryOptions().forEach(function (c) {
      var code = c.code || c.value || "";
      var name = c.name || c.label || code;
      if (!code) return;
      var opt = document.createElement("option");
      opt.value = code;
      opt.textContent = name;
      country.appendChild(opt);
    });

    var city = document.createElement("input");
    city.type = "search";
    city.placeholder = t("City");
    city.setAttribute("aria-label", t("City"));
    city.style.flex = "1";
    city.style.minWidth = "120px";

    var place = document.createElement("input");
    place.type = "search";
    place.placeholder = t("Address search");
    place.style.flex = "1";
    place.style.minWidth = "160px";

    var placeBtn = document.createElement("button");
    placeBtn.type = "button";
    placeBtn.textContent = t("Search place");

    var gpsBtn = document.createElement("button");
    gpsBtn.type = "button";
    gpsBtn.textContent = t("Use my location");

    var boundsBtn = document.createElement("button");
    boundsBtn.type = "button";
    boundsBtn.textContent = t("Search this area");

    var shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.textContent = t("Share location");

    var copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = t("Copy location link");

    var routeMode = document.createElement("select");
    routeMode.setAttribute("aria-label", t("Route"));
    [
      ["driving", "Driving"],
      ["walking", "Walking"],
      ["cycling", "Cycling"]
    ].forEach(function (pair) {
      var o = document.createElement("option");
      o.value = pair[0];
      o.textContent = t(pair[1]);
      routeMode.appendChild(o);
    });

    var layerGroup = document.createElement("div");
    layerGroup.style.cssText = "display:flex;flex-wrap:wrap;gap:6px";
    function layerButton(mode, label) {
      var b = document.createElement("button");
      b.type = "button";
      b.dataset.layer = mode;
      b.textContent = t(label);
      return b;
    }
    var streetBtn = layerButton("street", "Street map");
    var satBtn = layerButton("satellite", "Satellite");
    var hybridBtn = layerButton("hybrid", "Hybrid");
    streetBtn.classList.add("is-active");
    layerGroup.appendChild(streetBtn);
    layerGroup.appendChild(satBtn);
    layerGroup.appendChild(hybridBtn);

    tools.appendChild(country);
    tools.appendChild(city);
    tools.appendChild(place);
    tools.appendChild(placeBtn);
    tools.appendChild(gpsBtn);
    tools.appendChild(boundsBtn);
    tools.appendChild(routeMode);
    tools.appendChild(shareBtn);
    tools.appendChild(copyBtn);
    tools.appendChild(layerGroup);

    var mapEl = document.createElement("div");
    mapEl.id = opts.mapId || "havkarMap_" + Math.random().toString(36).slice(2, 8);
    mapEl.className = "havkar-map-host";
    mapEl.style.cssText =
      "height:min(42vh,340px);min-height:220px;border-radius:12px;border:1px solid #d7e6db";
    mapEl.setAttribute("role", "application");
    mapEl.setAttribute("aria-label", t("Map"));

    var note = document.createElement("p");
    note.className = "havkar-map-status";
    note.textContent = t("No mapped results in this view");

    host.appendChild(tools);
    host.appendChild(mapEl);
    host.appendChild(note);

    function composedQuery(extra) {
      var parts = [];
      var cty = String(city.value || "").trim();
      var addr = String(extra || place.value || "").trim();
      var code = String(country.value || "").trim();
      var cName = "";
      if (code && country.selectedOptions && country.selectedOptions[0]) {
        cName = country.selectedOptions[0].textContent || code;
      }
      if (addr) parts.push(addr);
      if (cty) parts.push(cty);
      if (cName) parts.push(cName);
      return parts.join(", ");
    }

    return root.HAVKAR_MAP.create(mapEl, {
      /* Land-centered Rome default — zoom 5 over water reads as a "blue only" map. */
      latitude: opts.latitude || 41.9028,
      longitude: opts.longitude || 12.4964,
      zoom: opts.zoom || 11,
      cluster: true
    }).then(function (api) {
      if (api && api.invalidate) {
        setTimeout(function () { api.invalidate(); }, 120);
        setTimeout(function () { api.invalidate(); }, 600);
      }
      var lastItems = [];
      var lastCenter = {
        latitude: opts.latitude || 41.9,
        longitude: opts.longitude || 12.5,
        label: ""
      };

      function refreshNote(count) {
        note.textContent =
          count > 0 ? t("Map") + ": " + count : t("No mapped results in this view");
      }

      function markLayer(mode) {
        [streetBtn, satBtn, hybridBtn].forEach(function (b) {
          b.classList.toggle("is-active", b.dataset.layer === mode);
        });
      }

      [streetBtn, satBtn, hybridBtn].forEach(function (b) {
        b.addEventListener("click", function () {
          Promise.resolve(api.setBaseLayer(b.dataset.layer)).then(function (result) {
            var mode = (result && result.mode) || b.dataset.layer || "street";
            markLayer(mode);
            note.textContent =
              mode === "satellite" || mode === "hybrid"
                ? t("Satellite") + " · Esri attribution required"
                : t("Street map");
          });
        });
      });

      placeBtn.addEventListener("click", function () {
        var q = composedQuery();
        api.searchPlace(q).then(function (geo) {
          if (!geo || !geo.ok) {
            note.textContent = t("Location permission denied");
            return;
          }
          lastCenter = {
            latitude: geo.primary.latitude,
            longitude: geo.primary.longitude,
            label: (geo.primary && geo.primary.label) || q
          };
          note.textContent = lastCenter.label || t("Search place");
          if (typeof opts.onPlace === "function") opts.onPlace(geo);
        });
      });

      function searchCityCountry() {
        var q = composedQuery("");
        if (!q) return;
        api.searchPlace(q).then(function (geo) {
          if (!geo || !geo.ok) {
            note.textContent = t("No mapped results in this view");
            return;
          }
          lastCenter = {
            latitude: geo.primary.latitude,
            longitude: geo.primary.longitude,
            label: (geo.primary && geo.primary.label) || q
          };
          note.textContent = lastCenter.label;
          if (typeof opts.onPlace === "function") opts.onPlace(geo);
        });
      }

      country.addEventListener("change", searchCityCountry);
      city.addEventListener("change", searchCityCountry);

      gpsBtn.addEventListener("click", function () {
        api
          .requestGps()
          .then(function (pos) {
            lastCenter = {
              latitude: pos.latitude,
              longitude: pos.longitude,
              label: t("Use my location")
            };
            note.textContent = t("Use my location");
            if (typeof opts.onGps === "function") opts.onGps(pos);
          })
          .catch(function () {
            note.textContent = t("Location permission denied");
          });
      });

      boundsBtn.addEventListener("click", function () {
        var filtered = api.filterItemsInBounds(lastItems);
        api.setMarkers(filtered);
        refreshNote(filtered.length);
        if (typeof opts.onBounds === "function") {
          opts.onBounds(api.getBoundsFilter(), filtered);
        }
      });

      shareBtn.addEventListener("click", function () {
        api
          .nativeShareLocation(lastCenter.latitude, lastCenter.longitude, lastCenter.label)
          .then(function (res) {
            note.textContent = res.shared
              ? t("Share location")
              : res.method === "cancelled"
                ? t("Share location")
                : (res.text || t("Copy location link"));
          });
      });

      copyBtn.addEventListener("click", function () {
        var payload = api.mapsSharePayload(
          lastCenter.latitude,
          lastCenter.longitude,
          lastCenter.label
        );
        if (!payload.ok) {
          note.textContent = t("No mapped results in this view");
          return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(payload.url).then(
            function () {
              note.textContent = t("Copy location link");
            },
            function () {
              note.textContent = payload.url;
            }
          );
        } else {
          note.textContent = payload.url;
        }
      });

      return {
        api: api,
        setItems: function (items) {
          lastItems = Array.isArray(items) ? items : [];
          var n = api.setMarkers(lastItems);
          refreshNote(n);
          return n;
        },
        suppress: function (on) {
          host.classList.toggle("is-suppressed", !!on);
          if (!on && api.invalidate) api.invalidate();
        },
        setCountryCity: function (code, cityName) {
          if (code) country.value = String(code);
          if (cityName != null) city.value = String(cityName);
        },
        getRouteProfile: function () {
          return routeMode.value || "driving";
        },
        note: note,
        countryEl: country,
        cityEl: city
      };
    });
  }

  function suppressAllMaps(on) {
    document.querySelectorAll(".havkar-module-map").forEach(function (el) {
      el.classList.toggle("is-suppressed", !!on);
    });
  }

  root.HAVKAR_MODULE_MAP = {
    mount: mount,
    t: t,
    suppressAllMaps: suppressAllMaps
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
