/**
 * Hotel / place surroundings for Accommodation (+ reusable on Tickets).
 * Centers map on real coords, loads nearby licensed cameras + Commons photos,
 * and shows honest Street View status (never fake 360).
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
    host.appendChild(el("h2", { className: "havkar-surroundings-title" }, "Surroundings"));
    var status = el("p", { className: "havkar-surroundings-status", "data-surr": "status" }, "Locating stay…");
    host.appendChild(status);
    var close = el("button", { type: "button", className: "havkar-surroundings-close", "aria-label": "Close" }, "×");
    close.addEventListener("click", function () {
      host.hidden = true;
    });
    host.appendChild(close);

    var tools = el("div", { className: "havkar-surroundings-tools" });
    var radiusLabel = el("label", null, "Radius km ");
    var radius = el("select", { "data-surr": "radius", "aria-label": "Search radius km" });
    [1, 2, 3, 5, 10, 15].forEach(function (n) {
      var o = el("option", { value: String(n) }, String(n) + " km");
      if (n === radiusKm) o.selected = true;
      radius.appendChild(o);
    });
    radiusLabel.appendChild(radius);
    tools.appendChild(radiusLabel);
    var satBtn = el("button", { type: "button", "data-surr": "satellite" }, "Satellite");
    var hybridBtn = el("button", { type: "button", "data-surr": "hybrid" }, "Hybrid");
    var streetBtn = el("button", { type: "button", "data-surr": "street" }, "Street map");
    var camsBtn = el("button", { type: "button", className: "primary", "data-surr": "cams" }, "Nearby cameras");
    var photosBtn = el("button", { type: "button", "data-surr": "photos" }, "Nearby photos");
    var svBtn = el("button", { type: "button", "data-surr": "streetview" }, "360° Street View");
    var poisBtn = el("button", { type: "button", "data-surr": "pois" }, "Nearby places");
    var guideBtn = el("button", { type: "button", "data-surr": "guide" }, "Smart notes");
    var tripBtn = el("button", { type: "button", "data-surr": "trip" }, "Add to trip");
    var routeBtn = el("button", { type: "button", "data-surr": "route-origin" }, "Route from here");
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
    host.appendChild(el("h3", null, "Places nearby (TomTom)"));
    host.appendChild(poisBox);
    host.appendChild(el("h3", null, "Smart location notes"));
    host.appendChild(guideBox);
    host.appendChild(el("h3", null, "Cameras near stay"));
    host.appendChild(camsBox);
    host.appendChild(el("h3", null, "Licensed photos nearby"));
    host.appendChild(photosBox);

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
        setStatus(mode + " basemap · surroundings of “" + (state.place && state.place.label) + "”");
      } else {
        setStatus("Basemap control unavailable on this page.");
      }
    }

    function renderCameras(cameras) {
      camsBox.innerHTML = "";
      if (!cameras || !cameras.length) {
        camsBox.appendChild(
          el(
            "p",
            { className: "havkar-surroundings-empty" },
            "No licensed public cameras within this radius. Coverage is not worldwide — this is not an error."
          )
        );
        return;
      }
      cameras.forEach(function (cam) {
        var card = el("article", { className: "havkar-surroundings-card" });
        card.appendChild(
          el(
            "strong",
            null,
            (cam.name || cam.id) +
              (cam.live_stream ? " · LIVE" : " · snapshot") +
              (cam.distance_km != null ? " · " + cam.distance_km + " km" : "")
          )
        );
        card.appendChild(
          el(
            "p",
            null,
            [cam.city, cam.country].filter(Boolean).join(", ") +
              (cam.attribution ? " · " + cam.attribution : "") +
              (cam.status ? " · status " + cam.status : "")
          )
        );
        var open = el("button", { type: "button" }, cam.live_stream ? "Play live" : "View snapshot");
        open.addEventListener("click", function () {
          if (root.HAVKAR_MAP_LIVE_LAYERS && typeof root.HAVKAR_MAP_LIVE_LAYERS.openCamera === "function") {
            root.HAVKAR_MAP_LIVE_LAYERS.openCamera(cam);
          } else if (cam.embed_url) {
            window.open(cam.watch_url || cam.embed_url, "_blank", "noopener,noreferrer");
          } else if (cam.image_url) {
            window.open(cam.image_url, "_blank", "noopener,noreferrer");
          }
        });
        card.appendChild(open);
        camsBox.appendChild(card);
        if (api && api.L && api.map && Number.isFinite(Number(cam.latitude))) {
          if (!api._surrCamLayer) api._surrCamLayer = api.L.layerGroup().addTo(api.map);
          api._surrCamLayer.addLayer(
            api.L.circleMarker([cam.latitude, cam.longitude], {
              radius: 7,
              color: cam.live_stream ? "#1b5e20" : "#e65100",
              fillColor: cam.live_stream ? "#66bb6a" : "#ff9800",
              fillOpacity: 0.9,
              weight: 2
            }).bindTooltip(
              (cam.name || cam.id) +
                (cam.distance_km != null ? " · " + cam.distance_km + " km" : "") +
                (cam.live_stream ? " · LIVE" : " · snapshot")
            )
          );
        }
      });
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
        var a = el("a", { href: ph.page_url || ph.full_url || "#", target: "_blank", rel: "noopener noreferrer" }, "Source");
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
          var add = el("button", { type: "button" }, "Add to trip");
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
              setStatus("Trip planner is not mounted on this page.");
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
      svBox.appendChild(
        el(
          "p",
          { className: "havkar-surroundings-empty" },
          (sv && sv.reason) ||
            "Interactive 360° is unavailable here. Add free HAVKAR_MAPILLARY_ACCESS_TOKEN for Mapillary, or Owner-approved HAVKAR_GOOGLE_MAPS_EMBED_API_KEY for Google Embed. No fake panoramas."
        )
      );
      if (sv && Array.isArray(sv.required_secrets) && sv.required_secrets.length) {
        var keys = el("ul", { className: "havkar-surroundings-keys" });
        sv.required_secrets.forEach(function (sec) {
          keys.appendChild(
            el(
              "li",
              null,
              sec.name +
                " · " +
                (sec.cost || "") +
                (sec.payment_account_required ? " · billing account required to mint key" : " · no payment account")
            )
          );
        });
        svBox.appendChild(keys);
      }
      var fb = el("div", { className: "havkar-surroundings-fallbacks" });
      fb.appendChild(el("button", { type: "button", "data-fb": "satellite" }, "Open satellite"));
      fb.appendChild(el("button", { type: "button", "data-fb": "photos" }, "Show nearby photos"));
      fb.querySelector('[data-fb="satellite"]').addEventListener("click", function () {
        setBase("satellite");
      });
      fb.querySelector('[data-fb="photos"]').addEventListener("click", function () {
        renderPhotos(state.payload && state.payload.photos);
      });
      svBox.appendChild(fb);
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
        "aria-label": "Mapillary street view"
      });
      svBox.appendChild(mount);
      svBox.appendChild(
        el(
          "p",
          { className: "havkar-surroundings-sv-meta" },
          "Mapillary · rotate with drag · move along sequence when coverage exists · " +
            (sv.distance_m != null ? sv.distance_m + " m from stay · " : "") +
            (sv.attribution || "")
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
            "Open official Mapillary source"
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
            mount.textContent = "Mapillary viewer failed to load.";
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
          mount.textContent =
            "Could not load Mapillary viewer. Use the official Mapillary link or satellite fallback.";
        });
    }

    function mountGoogleEmbed(sv) {
      var url = (sv.viewer && sv.viewer.embed_url) || sv.embed_url;
      if (!url || !/^https:\/\/www\.google\.com\/maps\/embed\//i.test(url)) {
        renderStreetViewFallbacks(sv);
        return;
      }
      var frame = el("iframe", {
        className: "havkar-surroundings-gembed",
        title: "Google Street View near stay",
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
          "Google Maps Embed Street View · rotate and move when Google coverage exists · usage $0 · " +
            (sv.attribution || "")
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
          "&radius_m=50&provider=auto&limit=12",
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
        "Loading surroundings within " + r + " km of “" + state.place.label + "”…"
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
          renderCameras(body && body.cameras);
          renderPhotos(body && body.photos);
          renderPois(body && body.pois);
          renderStreetView(body && body.street_view);
          loadSmartGuide();
          setStatus(
            "Surroundings · " +
              state.place.label +
              " · cameras " +
              ((body && body.camera_count) || 0) +
              " · photos " +
              ((body && body.photo_count) || 0) +
              " · places " +
              ((body && body.pois && body.pois.count) || 0) +
              " · 360° " +
              (body && body.street_view && body.street_view.interactive_360 ? "ON" : "unavailable") +
              " · free · " +
              (state.place.source || "coords")
          );
        })
        .catch(function () {
          setStatus("Surroundings lookup failed. Map and satellite still work.");
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
        setStatus(ok ? "Stay added to trip planner." : "Could not add stay (missing coords or plan full).");
      } else {
        setStatus("Trip planner is not mounted on this page.");
      }
    });
    svBtn.addEventListener("click", function () {
      setStatus("Loading real street-level coverage near stay…");
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
        "Origin set to stay coordinates. Enter a destination and tap Route in the map toolbar."
      );
    });
    radius.addEventListener("change", loadNearby);

    return resolveCoords(opts).then(function (place) {
      if (!place) {
        setStatus(
          "This stay has no verified coordinates and geocoding found no match. No invented location is used."
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
      "View surroundings"
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
        "Add to trip"
      );
      trip.addEventListener("click", function () {
        if (!root._havkarTripApi) {
          if (setNote) setNote("Trip planner is not ready on this page.");
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
        if (setNote) setNote("Added to trip planner (device-local).");
      });
      actions.appendChild(trip);
    }
  }

  root.HAVKAR_HOTEL_SURROUNDINGS = {
    open: openSurroundings,
    attachListingButton: attachListingButton
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
