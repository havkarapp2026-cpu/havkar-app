/**
 * Hotel / place surroundings for Accommodation (+ reusable on Tickets).
 * Centers map on real coords, loads nearby licensed cameras + Commons photos,
 * and shows honest Street View status (never fake 360).
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
    if (document.getElementById("havkar-hotel-surroundings-css")) return;
    var link = document.createElement("link");
    link.id = "havkar-hotel-surroundings-css";
    link.rel = "stylesheet";
    link.href = "/havkar-hotel-surroundings.css";
    document.head.appendChild(link);
  }

  function panelHost() {
    var host = document.getElementById("havkarSurroundingsPanel");
    if (host) return host;
    host = el("aside", {
      id: "havkarSurroundingsPanel",
      className: "havkar-surroundings",
      hidden: "hidden",
      "aria-live": "polite"
    });
    document.body.appendChild(host);
    return host;
  }

  function geocode(q) {
    if (root.HAVKAR_MAP && root.HAVKAR_MAP.geocode) {
      return root.HAVKAR_MAP.geocode(q);
    }
    return fetch(
      "/api/map-tomtom-search?q=" + encodeURIComponent(q) + "&limit=5&typeahead=true",
      { headers: { Accept: "application/json" }, cache: "no-store" }
    ).then(function (r) {
      return r.json();
    });
  }

  function resolveCoords(opts) {
    var lat = Number(opts.latitude != null ? opts.latitude : opts.lat);
    var lng = Number(opts.longitude != null ? opts.longitude : opts.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return Promise.resolve({
        latitude: lat,
        longitude: lng,
        label: opts.label || opts.title || "Stay",
        source: "listing_coordinates"
      });
    }
    var q = String(opts.address || opts.label || opts.title || "").trim();
    if (q.length < 2) {
      return Promise.resolve(null);
    }
    return geocode(q).then(function (geo) {
      if (!geo || !geo.ok || !geo.primary) return null;
      return {
        latitude: geo.primary.latitude,
        longitude: geo.primary.longitude,
        label: opts.title || geo.primary.label || q,
        source: "tomtom_geocode",
        geocoded_label: geo.primary.label
      };
    });
  }

  function openSurroundings(options) {
    ensureCss();
    var opts = options || {};
    var api = opts.api || null;
    var radiusKm = Number(opts.radius_km) || 3;
    radiusKm = Math.min(Math.max(radiusKm, 0.5), 25);
    var host = panelHost();
    host.hidden = false;
    host.innerHTML = "";
    host.setAttribute("dir", mapDir());
    host.setAttribute("lang", (root.HAVKAR_MAP_I18N && root.HAVKAR_MAP_I18N.lang && root.HAVKAR_MAP_I18N.lang()) || "en");
    var titleEl = el("h2", { className: "havkar-surroundings-title", "data-i18n-map": "maps.surr_title" }, mt("maps.surr_title"));
    host.appendChild(titleEl);
    var status = el("p", { className: "havkar-surroundings-status", "data-surr": "status" }, mt("maps.surr_locating"));
    host.appendChild(status);
    var close = el("button", { type: "button", className: "havkar-surroundings-close", "aria-label": "Close" }, "×");
    close.addEventListener("click", function () {
      host.hidden = true;
    });
    host.appendChild(close);

    var tools = el("div", { className: "havkar-surroundings-tools" });
    var radiusLabel = el("label", null, mt("maps.radius_km") + " ");
    var radius = el("select", { "data-surr": "radius", "aria-label": mt("maps.radius_km") });
    [1, 2, 3, 5, 10, 15].forEach(function (n) {
      var o = el("option", { value: String(n) }, String(n) + " km");
      if (n === radiusKm) o.selected = true;
      radius.appendChild(o);
    });
    radiusLabel.appendChild(radius);
    tools.appendChild(radiusLabel);
    var satBtn = el("button", { type: "button", "data-surr": "satellite", "data-i18n-map": "maps.layer_satellite" }, mt("maps.layer_satellite"));
    var hybridBtn = el("button", { type: "button", "data-surr": "hybrid", "data-i18n-map": "maps.layer_hybrid" }, mt("maps.layer_hybrid"));
    var streetBtn = el("button", { type: "button", "data-surr": "street", "data-i18n-map": "maps.layer_street" }, mt("maps.layer_street"));
    var camsBtn = el("button", { type: "button", className: "primary", "data-surr": "cams", "data-i18n-map": "maps.nearby_cameras" }, mt("maps.nearby_cameras"));
    var photosBtn = el("button", { type: "button", "data-surr": "photos", "data-i18n-map": "maps.nearby_photos" }, mt("maps.nearby_photos"));
    var svBtn = el("button", { type: "button", "data-surr": "streetview", "data-i18n-map": "maps.street_view_360" }, mt("maps.street_view_360"));
    var poisBtn = el("button", { type: "button", "data-surr": "pois", "data-i18n-map": "maps.nearby_places" }, mt("maps.nearby_places"));
    var guideBtn = el("button", { type: "button", "data-surr": "guide", "data-i18n-map": "maps.smart_notes" }, mt("maps.smart_notes"));
    var tripBtn = el("button", { type: "button", "data-surr": "trip", "data-i18n-map": "maps.add_to_trip" }, mt("maps.add_to_trip"));
    var routeBtn = el("button", { type: "button", "data-surr": "route-origin", "data-i18n-map": "maps.route_from_here" }, mt("maps.route_from_here"));
    [satBtn, hybridBtn, streetBtn, camsBtn, photosBtn, svBtn, poisBtn, guideBtn, tripBtn, routeBtn].forEach(function (b) {
      tools.appendChild(b);
    });
    host.appendChild(tools);

    var camsBox = el("div", { className: "havkar-surroundings-list", "data-surr": "cams-list" });
    var photosBox = el("div", { className: "havkar-surroundings-list", "data-surr": "photos-list" });
    var poisBox = el("div", { className: "havkar-surroundings-list", "data-surr": "pois-list" });
    var guideBox = el("div", { className: "havkar-surroundings-guide", "data-surr": "guide" });
    var svBox = el("div", { className: "havkar-surroundings-sv", "data-surr": "sv" });
    host.appendChild(svBox);
    var hPlaces = el("h3", { "data-i18n-map": "maps.places_nearby" }, mt("maps.places_nearby") + " (TomTom)");
    var hGuide = el("h3", { "data-i18n-map": "maps.smart_notes" }, mt("maps.smart_notes"));
    var hCams = el("h3", { "data-i18n-map": "maps.cameras_near" }, mt("maps.cameras_near"));
    var hPhotos = el("h3", { "data-i18n-map": "maps.photos_nearby" }, mt("maps.photos_nearby"));
    host.appendChild(hPlaces);
    host.appendChild(poisBox);
    host.appendChild(hGuide);
    host.appendChild(guideBox);
    host.appendChild(hCams);
    host.appendChild(camsBox);
    host.appendChild(hPhotos);
    host.appendChild(photosBox);

    function refreshSurrChrome() {
      host.setAttribute("dir", mapDir());
      titleEl.textContent = mt("maps.surr_title");
      satBtn.textContent = mt("maps.layer_satellite");
      hybridBtn.textContent = mt("maps.layer_hybrid");
      streetBtn.textContent = mt("maps.layer_street");
      camsBtn.textContent = mt("maps.nearby_cameras");
      photosBtn.textContent = mt("maps.nearby_photos");
      svBtn.textContent = mt("maps.street_view_360");
      poisBtn.textContent = mt("maps.nearby_places");
      guideBtn.textContent = mt("maps.smart_notes");
      tripBtn.textContent = mt("maps.add_to_trip");
      routeBtn.textContent = mt("maps.route_from_here");
      hPlaces.textContent = mt("maps.places_nearby") + " (TomTom)";
      hGuide.textContent = mt("maps.smart_notes");
      hCams.textContent = mt("maps.cameras_near");
      hPhotos.textContent = mt("maps.photos_nearby");
      if (root.HAVKAR_MAP_I18N && root.HAVKAR_MAP_I18N.apply) root.HAVKAR_MAP_I18N.apply(host);
    }
    if (root.HAVKAR_MAP_I18N && root.HAVKAR_MAP_I18N.onChange) root.HAVKAR_MAP_I18N.onChange(refreshSurrChrome);
    document.addEventListener("havkar:i18n-ready", refreshSurrChrome);
    document.addEventListener("havkar:language-changed", refreshSurrChrome);

    var state = { place: null, payload: null };

    function setStatus(msg) {
      status.textContent = msg || "";
      if (typeof opts.setNote === "function") opts.setNote(msg || "");
    }

    function centerMap(place, zoom) {
      if (!place) return;
      if (api && api.setCenter) api.setCenter(place.latitude, place.longitude, zoom || 16);
      else if (api && api.map) api.map.setView([place.latitude, place.longitude], zoom || 16);
      if (api && api.setMarkers) {
        api.setMarkers(
          [
            {
              id: "hotel-surroundings",
              latitude: place.latitude,
              longitude: place.longitude,
              label: place.label || "Stay"
            }
          ],
          { fit: false }
        );
      }
      try {
        var shell = document.getElementById("accMapShell") || document.getElementById("ticketsMapShell");
        if (shell && shell.scrollIntoView) shell.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (_e) {}
    }

    function setBase(mode) {
      if (api && typeof api.setBaseLayer === "function") {
        api.setBaseLayer(mode);
        setStatus(
          mt("maps.layer_" + (mode === "street" ? "street" : mode === "hybrid" ? "hybrid" : "satellite")) +
            " · “" +
            (state.place && state.place.label) +
            "”"
        );
      } else {
        setStatus(mt("maps.msg_surr_fail"));
      }
    }

    function playCamera(cam, isLive) {
      if (!isLive && cam && cam.live_stream) {
        setStatus(mt("maps.cam_state_exists_no_play"));
      }
      if (root.HAVKAR_MAP_LIVE_LAYERS && typeof root.HAVKAR_MAP_LIVE_LAYERS.openCamera === "function") {
        root.HAVKAR_MAP_LIVE_LAYERS.openCamera(cam);
        return;
      }
      if (cam && (cam.embed_url || cam.watch_url)) {
        window.open(cam.watch_url || cam.embed_url, "_blank", "noopener,noreferrer");
        return;
      }
      if (cam && cam.image_url) {
        window.open(cam.image_url, "_blank", "noopener,noreferrer");
      }
    }

    function appendCameraCard(cam, opts) {
      opts = opts || {};
      var isLive = !!(cam.live_stream && cam.status === "live");
      var isUnknown =
        !isLive &&
        (cam.availability === "unknown" || cam.status === "unknown" || (cam.live_stream && !isLive));
      var card = el("article", {
        className: "havkar-surroundings-card",
        "data-cam-card": String(cam.id || cam.name || "cam"),
        "data-cam-live": isLive ? "1" : "0"
      });
      card.appendChild(
        el(
          "strong",
          null,
          (cam.name || cam.id) +
            (isLive ? " · LIVE" : isUnknown ? " · UNKNOWN" : cam.live_stream ? " · offline" : " · snapshot") +
            (cam.distance_km != null ? " · " + cam.distance_km + " km" : "")
        )
      );
      card.appendChild(
        el(
          "p",
          null,
          [cam.city, cam.country].filter(Boolean).join(", ") +
            (cam.attribution ? " · " + cam.attribution : "") +
            (opts.outsideRadius ? " · " + mt("maps.cam_outside_radius") : "")
        )
      );
      if (!isLive && cam.live_stream) {
        card.appendChild(
          el("p", { className: "havkar-surroundings-meta" }, mt("maps.cam_state_exists_no_play"))
        );
      }
      var open = el(
        "button",
        {
          type: "button",
          "data-cam-play": isLive ? "live" : isUnknown ? "unknown" : "view"
        },
        isLive ? mt("maps.play_live") : isUnknown ? mt("maps.open_youtube") : mt("maps.view")
      );
      open.addEventListener("click", function () {
        playCamera(cam, isLive);
      });
      card.appendChild(open);
      camsBox.appendChild(card);
      if (api && api.L && api.map && Number.isFinite(Number(cam.latitude))) {
        if (!api._surrCamLayer) api._surrCamLayer = api.L.layerGroup().addTo(api.map);
        api._surrCamLayer.addLayer(
          api.L.circleMarker([cam.latitude, cam.longitude], {
            radius: 7,
            color: isLive ? "#1b5e20" : "#e65100",
            fillColor: isLive ? "#66bb6a" : "#ff9800",
            fillOpacity: 0.9,
            weight: 2
          }).bindTooltip(
            (cam.name || cam.id) +
              (cam.distance_km != null ? " · " + cam.distance_km + " km" : "") +
              (isLive ? " · LIVE" : " · snapshot")
          )
        );
      }
    }

    function renderCameras(cameras, meta) {
      camsBox.innerHTML = "";
      meta = meta || {};
      var nearest = meta.nearest_live_camera;
      var list = Array.isArray(cameras) ? cameras.slice() : [];
      list.sort(function (a, b) {
        var da = Number(a && a.distance_km);
        var db = Number(b && b.distance_km);
        if (Number.isFinite(da) && Number.isFinite(db)) return da - db;
        if (Number.isFinite(da)) return -1;
        if (Number.isFinite(db)) return 1;
        return 0;
      });

      /* State 3: no LIVE in selected radius — keep feature visible with nearest Play. */
      if (!list.length) {
        var emptyMsg = mt("maps.cam_state_no_live_here");
        if (nearest && nearest.distance_km != null && nearest.status === "live") {
          emptyMsg =
            mt("maps.msg_nearest_live", { km: nearest.distance_km }) +
            (nearest.name ? " (“" + nearest.name + "”)" : "");
        } else {
          emptyMsg = mt("maps.msg_no_cams_radius");
        }
        camsBox.appendChild(
          el("p", { className: "havkar-surroundings-empty", "data-cam-state": "no_live_here" }, emptyMsg)
        );
        if (nearest && nearest.live_stream && nearest.status === "live") {
          appendCameraCard(nearest, { outsideRadius: !nearest.within_radius });
        } else {
          camsBox.appendChild(
            el(
              "p",
              { className: "havkar-surroundings-meta", "data-cam-state": "feature_available" },
              mt("maps.cam_feature_available")
            )
          );
        }
        return;
      }

      list.forEach(function (cam) {
        appendCameraCard(cam, {});
      });
      /* If radius has only snapshots/offline, still surface nearest verified LIVE. */
      var hasLiveInList = list.some(function (c) {
        return c && c.live_stream && c.status === "live";
      });
      if (
        !hasLiveInList &&
        nearest &&
        nearest.live_stream &&
        nearest.status === "live" &&
        !list.some(function (c) {
          return c && nearest && String(c.id) === String(nearest.id);
        })
      ) {
        camsBox.appendChild(
          el("p", { className: "havkar-surroundings-meta", "data-cam-state": "no_live_here" }, mt("maps.cam_state_no_live_here"))
        );
        appendCameraCard(nearest, { outsideRadius: true });
      }
    }

    function renderPhotos(photos) {
      photosBox.innerHTML = "";
      if (!photos || !photos.length) {
        photosBox.appendChild(
          el(
            "p",
            { className: "havkar-surroundings-empty" },
            "No Wikimedia Commons photos found nearby. Try satellite imagery."
          )
        );
        return;
      }
      photos.forEach(function (ph) {
        var card = el("article", { className: "havkar-surroundings-card photo" });
        if (ph.image_url) {
          var img = el("img", {
            src: ph.image_url,
            alt: ph.title || "Nearby photo",
            loading: "lazy"
          });
          card.appendChild(img);
        }
        card.appendChild(el("strong", null, ph.title || "Photo"));
        card.appendChild(
          el(
            "p",
            null,
            (ph.distance_km != null ? ph.distance_km + " km · " : "") +
              (ph.attribution || "") +
              (ph.license ? " · " + ph.license : "")
          )
        );
        var a = el("a", { href: ph.page_url || ph.full_url || "#", target: "_blank", rel: "noopener noreferrer" }, mt("maps.source"));
        card.appendChild(a);
        photosBox.appendChild(card);
      });
    }

    function renderPois(poisPayload) {
      poisBox.innerHTML = "";
      var groups = (poisPayload && poisPayload.groups) || [];
      var places = (poisPayload && poisPayload.places) || [];
      if (!places.length) {
        poisBox.appendChild(
          el(
            "p",
            { className: "havkar-surroundings-empty" },
            (poisPayload && poisPayload.honesty) ||
              "No TomTom POIs in this radius. Coverage is not worldwide — empty is honest."
          )
        );
        return;
      }
      groups.forEach(function (g) {
        if (!g.places || !g.places.length) return;
        poisBox.appendChild(el("h4", null, g.label + " (" + g.places.length + ")"));
        g.places.slice(0, 4).forEach(function (p) {
          var card = el("article", { className: "havkar-surroundings-card" });
          card.appendChild(el("strong", null, p.name || g.label));
          card.appendChild(
            el(
              "p",
              null,
              (p.distance_m != null ? p.distance_m + " m · " : "") +
                (p.address || "") +
                " · TomTom · " +
                (p.fetched_at || "")
            )
          );
          var add = el("button", { type: "button" }, mt("maps.add_to_trip"));
          add.addEventListener("click", function () {
            if (root.HAVKAR_TRIP_PLANNER && root._havkarTripApi) {
              root._havkarTripApi.addStop({
                lat: p.latitude,
                lng: p.longitude,
                label: p.name,
                kind: p.category_id || "poi"
              });
              setStatus("Added “" + (p.name || "place") + "” to trip planner.");
            } else {
              setStatus(mt("maps.msg_trip_not_ready"));
            }
          });
          card.appendChild(add);
          poisBox.appendChild(card);
        });
      });
    }

    function renderGuide(guide) {
      guideBox.innerHTML = "";
      if (!guide || !guide.ok) {
        guideBox.appendChild(
          el(
            "p",
            { className: "havkar-surroundings-empty" },
            "Smart notes unavailable. No invented safety or hotel-quality claims."
          )
        );
        return;
      }
      (guide.insights || []).forEach(function (ins) {
        var card = el("article", { className: "havkar-surroundings-card" });
        card.appendChild(el("strong", null, ins.title || "Note"));
        card.appendChild(el("p", null, ins.detail || ""));
        card.appendChild(
          el(
            "p",
            { className: "havkar-surroundings-meta" },
            "Source: " +
              (ins.source || "havkar") +
              (ins.fetched_at ? " · " + ins.fetched_at : "") +
              (ins.confidence ? " · " + ins.confidence : "")
          )
        );
        guideBox.appendChild(card);
      });
      (guide.limits || []).forEach(function (lim) {
        guideBox.appendChild(
          el("p", { className: "havkar-surroundings-empty" }, lim.detail || lim.id || "")
        );
      });
    }

    function loadSmartGuide() {
      if (!state.place) return Promise.resolve(null);
      var r = Number(radius.value) || radiusKm;
      return fetch(
        "/api/map-smart-guide?lat=" +
          encodeURIComponent(state.place.latitude) +
          "&lng=" +
          encodeURIComponent(state.place.longitude) +
          "&radius_m=" +
          encodeURIComponent(Math.round(r * 1000)) +
          "&context=stay",
        { headers: { Accept: "application/json" }, cache: "no-store" }
      )
        .then(function (res) {
          return res.json();
        })
        .then(function (body) {
          state.guide = body;
          renderGuide(body);
          return body;
        })
        .catch(function () {
          renderGuide(null);
          return null;
        });
    }

    var mlyViewer = null;

    function destroyMlyViewer() {
      if (mlyViewer && typeof mlyViewer.remove === "function") {
        try {
          mlyViewer.remove();
        } catch (_e) {}
      }
      mlyViewer = null;
    }

    function loadScriptOnce(src, id) {
      return new Promise(function (resolve, reject) {
        if (id && document.getElementById(id)) {
          resolve();
          return;
        }
        var existing = document.querySelector('script[src="' + src + '"]');
        if (existing) {
          existing.addEventListener("load", function () {
            resolve();
          });
          if (existing.dataset.loaded === "1") resolve();
          return;
        }
        var s = document.createElement("script");
        if (id) s.id = id;
        s.src = src;
        s.async = true;
        s.onload = function () {
          s.dataset.loaded = "1";
          resolve();
        };
        s.onerror = function () {
          reject(new Error("script_load_failed"));
        };
        document.head.appendChild(s);
      });
    }

    function loadCssOnce(href, id) {
      if (id && document.getElementById(id)) return;
      if (document.querySelector('link[href="' + href + '"]')) return;
      var link = document.createElement("link");
      if (id) link.id = id;
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }

    function renderStreetViewFallbacks(sv) {
      var kind = (sv && sv.failure_kind) || "no_coverage";
      var msg =
        (sv && (sv.user_message || sv.reason)) ||
        "Interactive 360° is unavailable near this stay. Try widening the search or use satellite view. No fake panoramas.";
      if (/HAVKAR_|MAPILLARY_ACCESS|GOOGLE_MAPS/i.test(msg)) {
        msg =
          kind === "missing_key"
            ? "360° street imagery is not configured yet. Satellite and licensed photos may still help."
            : mt("maps.msg_no_360");
      }
      svBox.appendChild(el("p", { className: "havkar-surroundings-empty" }, msg));
      var fb = el("div", { className: "havkar-surroundings-fallbacks" });
      fb.appendChild(el("button", { type: "button", "data-fb": "expand360" }, mt("maps.widen_360")));
      fb.appendChild(el("button", { type: "button", "data-fb": "satellite" }, mt("maps.open_satellite")));
      fb.appendChild(el("button", { type: "button", "data-fb": "photos" }, mt("maps.show_photos")));
      fb.querySelector('[data-fb="expand360"]').addEventListener("click", function () {
        expandStreetViewSearch();
      });
      fb.querySelector('[data-fb="satellite"]').addEventListener("click", function () {
        setBase("satellite");
      });
      fb.querySelector('[data-fb="photos"]').addEventListener("click", function () {
        renderPhotos(state.payload && state.payload.photos);
      });
      svBox.appendChild(fb);
    }

    function expandStreetViewSearch() {
      if (!state.place) return;
      var next = Math.min(1000, Math.max(250, Number((state.svRadiusM || 50) * 2) || 250));
      state.svRadiusM = next;
      setStatus(mt("maps.msg_widen360", { m: next }));
      fetch(
        "/api/map-street-view?lat=" +
          encodeURIComponent(state.place.latitude) +
          "&lng=" +
          encodeURIComponent(state.place.longitude) +
          "&radius_m=" +
          encodeURIComponent(next) +
          "&expand=1&provider=auto&limit=12",
        { headers: { Accept: "application/json" }, cache: "no-store" }
      )
        .then(function (r) {
          return r.json();
        })
        .then(function (sv) {
          if (state.payload) state.payload.street_view = sv;
          renderStreetView(sv);
          setStatus(
            sv && sv.interactive_360
              ? mt("maps.msg_360_found", {
                  distance: sv.distance_m != null ? sv.distance_m + " m" : "",
                  radius: sv.radius_m != null ? sv.radius_m + " m" : ""
                })
              : (sv && sv.user_message) || mt("maps.msg_still_no360")
          );
        })
        .catch(function () {
          setStatus(mt("maps.msg_360_lookup_fail"));
        });
    }

    function mountMapillaryViewer(sv) {
      destroyMlyViewer();
      var viewerCfg = sv.viewer || {};
      var token = sv.client_token;
      var imageId = viewerCfg.initial_image_id || sv.initial_image_id;
      if (!token || !imageId) {
        renderStreetViewFallbacks(sv);
        return;
      }
      loadCssOnce(viewerCfg.cdn_css || "https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.css", "mly-css");
      var mount = el("div", {
        id: "havkarMlyViewer",
        className: "havkar-surroundings-mly",
        "aria-label": mt("maps.sv_title_mapillary")
      });
      svBox.appendChild(mount);
      svBox.appendChild(
        el(
          "h3",
          { "data-i18n-map": "maps.sv_title_mapillary" },
          mt("maps.sv_title_mapillary")
        )
      );
      svBox.appendChild(
        el(
          "p",
          { className: "havkar-surroundings-sv-meta" },
          mt("maps.sv_help_mapillary") +
            (sv.distance_m != null ? " · " + sv.distance_m + " m" : "") +
            (sv.attribution ? " · " + sv.attribution : "")
        )
      );
      if (sv.official_open_url) {
        svBox.appendChild(
          el(
            "a",
            {
              href: sv.official_open_url,
              target: "_blank",
              rel: "noopener noreferrer",
              className: "havkar-surroundings-official"
            },
            mt("maps.open_mapillary")
          )
        );
      }
      loadScriptOnce(
        viewerCfg.cdn_js || "https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.js",
        "mly-js"
      )
        .then(function () {
          var Viewer = root.mapillary && root.mapillary.Viewer;
          if (!Viewer) {
            mount.textContent = mt("maps.msg_360_lookup_fail");
            return;
          }
          mlyViewer = new Viewer({
            accessToken: token,
            container: mount,
            imageId: imageId,
            component: { sequence: true, cover: false }
          });
        })
        .catch(function () {
          mount.textContent = mt("maps.msg_360_lookup_fail");
        });
    }

    function mountGoogleEmbed(sv) {
      var url = (sv.viewer && sv.viewer.embed_url) || sv.embed_url;
      if (!url || !/^https:\/\/www\.google\.com\/maps\/embed\//i.test(url)) {
        renderStreetViewFallbacks(sv);
        return;
      }
      svBox.appendChild(
        el("h3", { "data-i18n-map": "maps.sv_title_google" }, mt("maps.sv_title_google"))
      );
      var frame = el("iframe", {
        className: "havkar-surroundings-gembed",
        title: mt("maps.sv_title_google"),
        src: url,
        allowfullscreen: "true",
        loading: "lazy",
        referrerpolicy: "strict-origin-when-cross-origin"
      });
      frame.setAttribute("allowfullscreen", "");
      svBox.appendChild(frame);
      svBox.appendChild(
        el(
          "p",
          { className: "havkar-surroundings-sv-meta" },
          mt("maps.sv_help_google") + (sv.attribution ? " · " + sv.attribution : "")
        )
      );
    }

    function fetchStreetViewForPlace() {
      if (!state.place) return Promise.resolve(null);
      return fetch(
        "/api/map-street-view?lat=" +
          encodeURIComponent(state.place.latitude) +
          "&lng=" +
          encodeURIComponent(state.place.longitude) +
          "&radius_m=50&expand=1&provider=auto&limit=12",
        { headers: { Accept: "application/json" }, cache: "no-store" }
      )
        .then(function (r) {
          return r.json();
        })
        .catch(function () {
          return null;
        });
    }

    function renderStreetView(sv) {
      destroyMlyViewer();
      svBox.innerHTML = "";
      svBox.appendChild(el("h3", null, "360° street view near stay"));
      if (sv && sv.interactive_360 === true && sv.available) {
        if (sv.provider === "mapillary" || (sv.viewer && sv.viewer.type === "mapillary_js")) {
          mountMapillaryViewer(sv);
          return;
        }
        if (
          sv.provider === "google_maps_embed_streetview" ||
          (sv.viewer && sv.viewer.type === "google_embed_iframe")
        ) {
          mountGoogleEmbed(sv);
          return;
        }
      }
      renderStreetViewFallbacks(sv || {});
    }

    function loadNearby() {
      if (!state.place) return;
      var r = Number(radius.value) || radiusKm;
      if (api && api._surrCamLayer) api._surrCamLayer.clearLayers();
      setStatus(
        mt("maps.msg_loading_surr", { km: r, place: state.place.label })
      );
      return fetch(
        "/api/map-nearby-surroundings?lat=" +
          encodeURIComponent(state.place.latitude) +
          "&lng=" +
          encodeURIComponent(state.place.longitude) +
          "&radius_km=" +
          encodeURIComponent(r),
        { headers: { Accept: "application/json" }, cache: "no-store" }
      )
        .then(function (res) {
          return res.json();
        })
        .then(function (body) {
          state.payload = body;
          renderCameras(body && body.cameras, body);
          renderPhotos(body && body.photos);
          renderPois(body && body.pois);
          renderStreetView(body && body.street_view);
          loadSmartGuide();
          var nearest = body && body.nearest_live_camera;
          var svTxt =
            body && body.street_view && body.street_view.interactive_360
              ? mt("maps.sv_on") +
                (body.street_view.distance_m != null
                  ? " · " + body.street_view.distance_m + " m"
                  : "")
              : mt("maps.sv_off_near");
          var statusMsg = mt("maps.surr_status", {
            label: state.place.label,
            places: (body && body.pois && body.pois.count) || 0,
            cams: (body && body.camera_count) || 0,
            photos: (body && body.photo_count) || 0,
            sv: svTxt
          });
          if ((!body || !body.camera_count) && nearest && nearest.distance_km != null) {
            statusMsg +=
              " · " + mt("maps.msg_nearest_live", { km: nearest.distance_km });
          }
          setStatus(statusMsg);
        })
        .catch(function () {
          setStatus(mt("maps.msg_surr_fail"));
        });
    }

    satBtn.addEventListener("click", function () {
      setBase("satellite");
    });
    hybridBtn.addEventListener("click", function () {
      setBase("hybrid");
    });
    streetBtn.addEventListener("click", function () {
      setBase("street");
    });
    camsBtn.addEventListener("click", loadNearby);
    photosBtn.addEventListener("click", function () {
      renderPhotos(state.payload && state.payload.photos);
    });
    poisBtn.addEventListener("click", function () {
      renderPois(state.payload && state.payload.pois);
      try {
        poisBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (_e) {}
    });
    guideBtn.addEventListener("click", function () {
      loadSmartGuide().then(function () {
        try {
          guideBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (_e) {}
      });
    });
    tripBtn.addEventListener("click", function () {
      if (!state.place) return;
      if (root.HAVKAR_TRIP_PLANNER && root._havkarTripApi) {
        var ok = root._havkarTripApi.addStop({
          lat: state.place.latitude,
          lng: state.place.longitude,
          label: state.place.label || "Stay",
          kind: "stay"
        });
        setStatus(ok ? mt("maps.msg_stay_added") : mt("maps.msg_trip_not_ready"));
      } else {
        setStatus(mt("maps.msg_trip_not_ready"));
      }
    });
    svBtn.addEventListener("click", function () {
      setStatus(mt("maps.msg_loading_street"));
      fetchStreetViewForPlace().then(function (sv) {
        if (state.payload) state.payload.street_view = sv;
        renderStreetView(sv);
        setStatus(
          "360° · " +
            ((sv && sv.provider) || "none") +
            (sv && sv.interactive_360 ? " · interactive ON" : " · unavailable") +
            (sv && sv.distance_m != null ? " · " + sv.distance_m + " m" : "")
        );
        try {
          svBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (_e) {}
      });
    });
    routeBtn.addEventListener("click", function () {
      if (!state.place) return;
      var from = document.querySelector('[data-pro="from"]');
      var to = document.querySelector('[data-pro="to"]');
      if (from) {
        from.value =
          Number(state.place.latitude).toFixed(6) + ", " + Number(state.place.longitude).toFixed(6);
      }
      if (to && !String(to.value || "").trim()) {
        to.focus();
      }
      setStatus(
        mt("maps.msg_origin_stay")
      );
    });
    radius.addEventListener("change", loadNearby);

    return resolveCoords(opts).then(function (place) {
      if (!place) {
        setStatus(
          mt("maps.msg_no_coords")
        );
        return { ok: false, error: "no_coordinates" };
      }
      state.place = place;
      centerMap(place, 16);
      setBase("hybrid");
      return loadNearby().then(function () {
        return { ok: true, place: place };
      });
    });
  }

  function attachListingButton(card, row, api, setNote) {
    if (!card || card.querySelector('[data-surr-open="1"]')) return;
    var btn = el(
      "button",
      {
        type: "button",
        className: "havkar-surroundings-cta",
        "data-surr-open": "1"
      },
      mt("maps.view_surroundings")
    );
    btn.addEventListener("click", function () {
      openSurroundings({
        api: api,
        setNote: setNote,
        latitude: row.latitude,
        longitude: row.longitude,
        title: row.title,
        label: row.title,
        address: row.address_line || [row.title, row.address_city, row.address_country].filter(Boolean).join(", "),
        radius_km: 3
      });
    });
    var actions = card.querySelector(".card-actions") || card;
    actions.appendChild(btn);
    if (!card.querySelector('[data-trip-add="1"]')) {
      var trip = el(
        "button",
        {
          type: "button",
          className: "havkar-surroundings-cta",
          "data-trip-add": "1"
        },
        mt("maps.add_to_trip")
      );
      trip.addEventListener("click", function () {
        if (!root._havkarTripApi) {
          if (setNote) setNote(mt("maps.msg_trip_not_ready"));
          return;
        }
        var lat = Number(row.latitude);
        var lng = Number(row.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          if (setNote) setNote("This listing has no verified coordinates — not added.");
          return;
        }
        root._havkarTripApi.addStop({
          lat: lat,
          lng: lng,
          label: row.title || "Stay",
          kind: "stay"
        });
        if (setNote) setNote(mt("maps.msg_stay_added"));
      });
      actions.appendChild(trip);
    }
  }

  root.HAVKAR_HOTEL_SURROUNDINGS = {
    open: openSurroundings,
    attachListingButton: attachListingButton
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
