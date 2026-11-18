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
    var routeBtn = el("button", { type: "button", "data-surr": "route-origin" }, "Route from here");
    [satBtn, hybridBtn, streetBtn, camsBtn, photosBtn, svBtn, routeBtn].forEach(function (b) {
      tools.appendChild(b);
    });
    host.appendChild(tools);

    var camsBox = el("div", { className: "havkar-surroundings-list", "data-surr": "cams-list" });
    var photosBox = el("div", { className: "havkar-surroundings-list", "data-surr": "photos-list" });
    var svBox = el("div", { className: "havkar-surroundings-sv", "data-surr": "sv" });
    host.appendChild(svBox);
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

    function renderStreetView(sv) {
      svBox.innerHTML = "";
      if (sv && sv.interactive_360 === true && sv.available) {
        svBox.appendChild(el("p", null, "Interactive 360° is available."));
        return;
      }
      svBox.appendChild(
        el(
          "p",
          { className: "havkar-surroundings-empty" },
          (sv && sv.reason) ||
            "Interactive 360° Street View is not configured (Google / Mapillary key + Owner commercial approval required). No fake panoramas are shown."
        )
      );
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
          renderStreetView(body && body.street_view);
          setStatus(
            "Surroundings · " +
              state.place.label +
              " · cameras " +
              ((body && body.camera_count) || 0) +
              " · photos " +
              ((body && body.photo_count) || 0) +
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
    svBtn.addEventListener("click", function () {
      renderStreetView(state.payload && state.payload.street_view);
      try {
        svBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (_e) {}
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
  }

  root.HAVKAR_HOTEL_SURROUNDINGS = {
    open: openSurroundings,
    attachListingButton: attachListingButton
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
