/**
 * Lightweight map panel mount for Buy & Sell / Jobs / Services / Delivery.
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

  function mount(options) {
    var opts = options || {};
    var host =
      typeof opts.container === "string"
        ? document.getElementById(opts.container)
        : opts.container;
    if (!host || !root.HAVKAR_MAP) {
      return Promise.reject(new Error("map_panel_unavailable"));
    }

    host.innerHTML = "";
    host.style.display = "grid";
    host.style.gap = "8px";

    var tools = document.createElement("div");
    tools.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center";
    var place = document.createElement("input");
    place.type = "search";
    place.placeholder = t("Search place");
    place.style.cssText = "flex:1;min-width:160px;min-height:42px;border:1px solid #cfd;border-radius:10px;padding:0 10px";
    var placeBtn = document.createElement("button");
    placeBtn.type = "button";
    placeBtn.textContent = t("Search place");
    var gpsBtn = document.createElement("button");
    gpsBtn.type = "button";
    gpsBtn.textContent = t("Use my location");
    var boundsBtn = document.createElement("button");
    boundsBtn.type = "button";
    boundsBtn.textContent = t("Search this area");
    [placeBtn, gpsBtn, boundsBtn].forEach(function (b) {
      b.style.cssText =
        "min-height:42px;border-radius:10px;padding:0 12px;border:1px solid #1b5e20;background:#fff;color:#1b5e20;font-weight:700;cursor:pointer";
    });
    tools.appendChild(place);
    tools.appendChild(placeBtn);
    tools.appendChild(gpsBtn);
    tools.appendChild(boundsBtn);

    var mapEl = document.createElement("div");
    mapEl.id = opts.mapId || ("havkarMap_" + Math.random().toString(36).slice(2, 8));
    mapEl.style.cssText =
      "height:min(42vh,340px);min-height:220px;border-radius:12px;border:1px solid #d7e6db";
    mapEl.setAttribute("role", "application");
    mapEl.setAttribute("aria-label", t("Map"));

    var note = document.createElement("p");
    note.style.cssText = "margin:0;color:#567;font-size:.9rem;line-height:1.4";
    note.textContent = t("No mapped results in this view");

    host.appendChild(tools);
    host.appendChild(mapEl);
    host.appendChild(note);

    return root.HAVKAR_MAP.create(mapEl, {
      latitude: opts.latitude || 41.9,
      longitude: opts.longitude || 12.5,
      zoom: opts.zoom || 5,
      cluster: true
    }).then(function (api) {
      var lastItems = [];
      function refreshNote(count) {
        note.textContent =
          count > 0
            ? t("Map") + ": " + count
            : t("No mapped results in this view");
      }
      placeBtn.addEventListener("click", function () {
        api.searchPlace(place.value).then(function (geo) {
          if (!geo || !geo.ok) {
            note.textContent = t("Location permission denied");
            return;
          }
          note.textContent = (geo.primary && geo.primary.label) || t("Search place");
          if (typeof opts.onPlace === "function") opts.onPlace(geo);
        });
      });
      gpsBtn.addEventListener("click", function () {
        api
          .requestGps()
          .then(function (pos) {
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
      return {
        api: api,
        setItems: function (items) {
          lastItems = Array.isArray(items) ? items : [];
          var n = api.setMarkers(lastItems);
          refreshNote(n);
          return n;
        },
        note: note
      };
    });
  }

  root.HAVKAR_MODULE_MAP = { mount: mount, t: t };
})(typeof globalThis !== "undefined" ? globalThis : this);
