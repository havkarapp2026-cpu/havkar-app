/**
 * Tickets / Accommodation map layer menu:
 * street | satellite | hybrid | live | rain | cameras | intersection | traffic
 * Only licensed public sources. Never invents feeds or accepts arbitrary stream URLs.
 */
(function (root) {
  "use strict";

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "className") node.className = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function attachLayerMenu(options) {
    var opts = options || {};
    var host =
      typeof opts.container === "string"
        ? document.getElementById(opts.container)
        : opts.container;
    var api = opts.api;
    var map = (api && api.map) || opts.map;
    var L = (api && api.L) || opts.L || root.L;
    var setNote =
      typeof opts.setNote === "function"
        ? opts.setNote
        : function () {};
    if (!host || !map || !L) {
      return { ok: false, error: "layer_menu_unavailable" };
    }

    host.innerHTML = "";
    host.classList.add("havkar-live-layer-menu");

    var modes = [
      ["street", "Street map"],
      ["satellite", "Satellite"],
      ["hybrid", "Hybrid"],
      ["live", "Live map"],
      ["rain", "Rain radar"],
      ["cameras", "Live video cams"],
      ["intersection", "Intersection snapshots"],
      ["traffic", "Traffic status"]
    ];

    var btnRow = el("div", {
      className: "havkar-map-layers",
      role: "group",
      "aria-label": "Map layers"
    });
    btnRow.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px";
    var buttons = {};
    modes.forEach(function (pair) {
      var b = el("button", {
        type: "button",
        "data-havkar-layer": pair[0]
      }, pair[1]);
      b.style.cssText =
        "min-height:40px;border-radius:10px;border:1px solid #1b5e20;background:#fff;color:#1b5e20;font-weight:600;padding:0 12px;cursor:pointer";
      if (pair[0] === "street") {
        b.classList.add("is-active");
        b.style.background = "#1b5e20";
        b.style.color = "#fff";
      }
      btnRow.appendChild(b);
      buttons[pair[0]] = b;
    });
    host.appendChild(btnRow);

    var meta = el("p", { className: "pending-note", role: "status" });
    meta.style.margin = "0 0 8px";
    host.appendChild(meta);

    var rainPanel = el("div", { className: "havkar-rain-panel", hidden: "hidden" });
    rainPanel.innerHTML =
      '<div class="havkar-rain-controls" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 6px">' +
      '<button type="button" data-rain="prev">Prev</button>' +
      '<button type="button" data-rain="play">Play</button>' +
      '<button type="button" data-rain="pause">Pause</button>' +
      '<button type="button" data-rain="next">Next</button>' +
      '<input type="range" data-rain="scrub" min="0" max="0" value="0" style="flex:1;min-width:120px" aria-label="Rain radar time">' +
      '<span data-rain="time"></span></div>' +
      '<div class="havkar-rain-legend" style="display:flex;flex-wrap:wrap;gap:8px;font-size:.8rem"></div>';
    host.appendChild(rainPanel);

    var cameraPanel = el("div", { className: "havkar-camera-panel", hidden: "hidden" });
    cameraPanel.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 6px">' +
      '<input type="search" data-cam="q" placeholder="Search name / city / country" style="flex:1;min-width:160px">' +
      '<select data-cam="country" aria-label="Country"><option value="all">All countries</option></select>' +
      '<select data-cam="city" aria-label="City"><option value="all">All cities</option></select>' +
      '<select data-cam="type" aria-label="Category"><option value="all">All categories</option>' +
      '<option value="street">Streets</option><option value="market">Markets</option>' +
      '<option value="square">Squares</option><option value="highway">Roads / highways</option>' +
      '<option value="tourism">Tourism</option><option value="coast">Coasts / ports</option>' +
      '<option value="airport">Airports / stations</option><option value="weather">Weather</option>' +
      '<option value="intersection">Intersections (JPEG)</option></select>' +
      '</div>' +
      '<p data-cam="honesty" style="margin:0 0 6px;font-size:.8rem;color:#555"></p>' +
      '<div data-cam="list" style="max-height:180px;overflow:auto;font-size:.85rem"></div>';
    host.appendChild(cameraPanel);

    var viewer = el("div", {
      className: "havkar-camera-viewer",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Camera viewer",
      "aria-hidden": "true"
    });
    /* CRITICAL: never leave display:flex while "closed". Inline display:flex
       overrides the HTML hidden attribute and locks tickets/accommodation taps. */
    viewer.style.cssText =
      "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;padding:16px;pointer-events:none";
    viewer.innerHTML =
      '<div data-cam="card" style="background:#fff;border-radius:14px;max-width:min(960px,96vw);width:100%;padding:12px;position:relative;pointer-events:auto">' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin:0 0 8px">' +
      '<button type="button" data-cam="play" style="min-height:40px">Play</button>' +
      '<button type="button" data-cam="pause" style="min-height:40px">Pause</button>' +
      '<button type="button" data-cam="fullscreen" style="min-height:40px">Fullscreen</button>' +
      '<button type="button" data-cam="close" style="min-height:40px;min-width:64px">Close</button></div>' +
      '<h3 data-cam="title" style="margin:0 0 6px;color:#1b5e20"></h3>' +
      '<p data-cam="place" style="margin:0 0 4px;font-size:.9rem"></p>' +
      '<p data-cam="attr" style="margin:0 0 8px;font-size:.8rem;color:#555"></p>' +
      '<div data-cam="media" style="width:100%;aspect-ratio:16/9;background:#111;border-radius:8px;overflow:hidden;position:relative">' +
      '<iframe data-cam="yt" title="Live public webcam" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen style="display:none;width:100%;height:100%;border:0"></iframe>' +
      '<img data-cam="img" alt="Public camera frame" style="display:none;width:100%;height:100%;object-fit:contain">' +
      '</div>' +
      '<p data-cam="status" style="margin:8px 0 0;font-size:.8rem"></p>' +
      '<p style="margin:8px 0 0"><a data-cam="watch" href="#" target="_blank" rel="noopener noreferrer">Open official source</a></p></div>';
    document.body.appendChild(viewer);

    function ytCommand(command) {
      var frame = viewer.querySelector('[data-cam="yt"]');
      if (!frame || !frame.contentWindow || frame.style.display === "none") return;
      try {
        frame.contentWindow.postMessage(
          JSON.stringify({ event: "command", func: command, args: [] }),
          "*"
        );
      } catch (_e) {}
    }

    function closeCameraViewer() {
      if (document.fullscreenElement) {
        try {
          document.exitFullscreen();
        } catch (_e) {}
      }
      ytCommand("pauseVideo");
      viewer.style.display = "none";
      viewer.style.pointerEvents = "none";
      viewer.setAttribute("aria-hidden", "true");
      viewer.hidden = true;
      var img = viewer.querySelector('[data-cam="img"]');
      if (img) {
        img.onload = null;
        img.onerror = null;
        img.removeAttribute("src");
        img.style.display = "none";
      }
      var yt = viewer.querySelector('[data-cam="yt"]');
      if (yt) {
        yt.removeAttribute("src");
        yt.style.display = "none";
      }
      var status = viewer.querySelector('[data-cam="status"]');
      if (status) status.textContent = "";
    }

    function openCameraViewerShell() {
      viewer.hidden = false;
      viewer.setAttribute("aria-hidden", "false");
      viewer.style.pointerEvents = "auto";
      viewer.style.display = "flex";
    }

    var state = {
      base: "street",
      rainOn: false,
      camerasOn: false,
      intersectionOn: false,
      trafficOn: false,
      rainFrames: [],
      rainIndex: 0,
      rainTimer: null,
      rainLayer: null,
      coverageLayer: null,
      cameraLayer: null,
      trafficLayer: null,
      cameras: [],
      rainMeta: null
    };

    function setMeta(text) {
      meta.textContent = text || "";
      setNote(text || "");
    }

    function styleActive(btn, on) {
      if (!btn) return;
      btn.classList.toggle("is-active", !!on);
      btn.style.background = on ? "#1b5e20" : "#fff";
      btn.style.color = on ? "#fff" : "#1b5e20";
    }

    function markBase(mode) {
      Object.keys(buttons).forEach(function (k) {
        var isBase = ["street", "satellite", "hybrid", "live"].indexOf(k) >= 0;
        if (!isBase) return;
        styleActive(buttons[k], k === mode);
      });
    }

    function markToggle(key, on) {
      styleActive(buttons[key], !!on);
    }

    function clearRainLayers() {
      if (state.rainLayer && map.hasLayer(state.rainLayer)) map.removeLayer(state.rainLayer);
      if (state.coverageLayer && map.hasLayer(state.coverageLayer)) map.removeLayer(state.coverageLayer);
      state.rainLayer = null;
      state.coverageLayer = null;
      if (state.rainTimer) {
        clearInterval(state.rainTimer);
        state.rainTimer = null;
      }
    }

    function applyRainFrame(index) {
      if (!state.rainFrames.length) return;
      var i = Math.max(0, Math.min(state.rainFrames.length - 1, index));
      state.rainIndex = i;
      var frame = state.rainFrames[i];
      if (state.rainLayer && map.hasLayer(state.rainLayer)) map.removeLayer(state.rainLayer);
      state.rainLayer = L.tileLayer(frame.tile_url, {
        maxZoom: 7,
        opacity: 0.72,
        attribution:
          'Weather data by <a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">RainViewer</a>'
      });
      state.rainLayer.addTo(map);
      var scrub = rainPanel.querySelector('[data-rain="scrub"]');
      var timeEl = rainPanel.querySelector('[data-rain="time"]');
      if (scrub) scrub.value = String(i);
      if (timeEl) timeEl.textContent = frame.time_utc || "";
      setMeta(
        "Rain radar · RainViewer · frame " +
          (frame.time_utc || "") +
          (state.rainMeta && state.rainMeta.generated_utc
            ? " · catalog updated " + state.rainMeta.generated_utc
            : "") +
          " · empty areas = no radar coverage"
      );
    }

    function loadRain() {
      setMeta("Loading rain radar…");
      return fetch("/api/map-rain-radar", { headers: { Accept: "application/json" } })
        .then(function (r) {
          return r.json();
        })
        .then(function (body) {
          state.rainMeta = body;
          if (!body || !body.ok || !body.available || !Array.isArray(body.frames) || !body.frames.length) {
            rainPanel.hidden = true;
            state.rainOn = false;
            markToggle("rain", false);
            setMeta(
              (body && body.message) ||
                "Rain radar is not available right now."
            );
            return false;
          }
          state.rainFrames = body.frames;
          rainPanel.hidden = false;
          var scrub = rainPanel.querySelector('[data-rain="scrub"]');
          if (scrub) {
            scrub.min = "0";
            scrub.max = String(Math.max(0, body.frames.length - 1));
          }
          var legend = rainPanel.querySelector(".havkar-rain-legend");
          if (legend && Array.isArray(body.legend)) {
            legend.innerHTML = body.legend
              .map(function (item) {
                return (
                  '<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:14px;height:14px;border-radius:3px;background:' +
                  String(item.color) +
                  ';border:1px solid #999"></span>' +
                  String(item.label) +
                  "</span>"
                );
              })
              .join("");
          }
          if (body.coverage_url) {
            if (state.coverageLayer && map.hasLayer(state.coverageLayer)) {
              map.removeLayer(state.coverageLayer);
            }
            state.coverageLayer = L.tileLayer(body.coverage_url, {
              maxZoom: 7,
              opacity: 0.28
            });
            state.coverageLayer.addTo(map);
          }
          applyRainFrame(body.frames.length - 1);
          state.rainOn = true;
          markToggle("rain", true);
          return true;
        })
        .catch(function () {
          setMeta("Rain radar is not available right now (network error).");
          return false;
        });
    }

    function openCamera(cam) {
      if (!cam) {
        closeCameraViewer();
        return;
      }
      openCameraViewerShell();
      viewer.querySelector('[data-cam="title"]').textContent = cam.name || cam.id;
      viewer.querySelector('[data-cam="place"]').textContent =
        (cam.place || cam.city || "") +
        (cam.country ? " · " + cam.country : "") +
        (cam.category ? " · " + cam.category : "");
      viewer.querySelector('[data-cam="attr"]').textContent =
        (cam.attribution || "") +
        (cam.license ? " · " + cam.license : "") +
        (cam.updated_at ? " · " + cam.updated_at : "");
      var img = viewer.querySelector('[data-cam="img"]');
      var yt = viewer.querySelector('[data-cam="yt"]');
      var status = viewer.querySelector('[data-cam="status"]');
      var watch = viewer.querySelector('[data-cam="watch"]');
      var watchUrl = cam.watch_url || cam.source_url || cam.image_url || "";
      if (watch) {
        watch.href = /^https:\/\//i.test(watchUrl) ? watchUrl : "#";
        watch.textContent = cam.live_stream
          ? "Open official live source"
          : "Open official snapshot source";
      }

      img.style.display = "none";
      yt.style.display = "none";
      img.removeAttribute("src");
      yt.removeAttribute("src");

      if (cam.live_stream && cam.youtube_id && /^[\w-]{11}$/.test(cam.youtube_id)) {
        status.textContent = "Loading official YouTube live player…";
        yt.style.display = "block";
        yt.src =
          "https://www.youtube-nocookie.com/embed/" +
          encodeURIComponent(cam.youtube_id) +
          "?playsinline=1&rel=0&modestbranding=1&enablejsapi=1&autoplay=1";
        status.textContent =
          "LIVE VIDEO via official YouTube embed · " +
          (cam.status === "unavailable" ? "source may be offline" : "curated public webcam");
        return;
      }

      var url = cam.image_url || cam.frame_proxy || "";
      if (!/^https:\/\//i.test(url)) {
        status.textContent =
          "No playable feed here. Use the official source link if available.";
        return;
      }
      status.textContent = "Loading periodic snapshot (not a live video)…";
      img.style.display = "block";
      img.onload = function () {
        status.textContent =
          "Periodic public snapshot — NOT live video. Source: " +
          (cam.attribution || "licensed feed");
      };
      img.onerror = function () {
        status.textContent = "This snapshot is unavailable right now.";
      };
      img.src = url;
    }

    function fillCameraFilters() {
      var countrySel = cameraPanel.querySelector('[data-cam="country"]');
      var citySel = cameraPanel.querySelector('[data-cam="city"]');
      if (!countrySel || !citySel) return;
      var countries = {};
      var cities = {};
      state.cameras.forEach(function (c) {
        if (c.country) countries[c.country] = true;
        if (c.city) cities[c.city] = true;
      });
      var keepCountry = countrySel.value || "all";
      var keepCity = citySel.value || "all";
      countrySel.innerHTML = '<option value="all">All countries</option>';
      Object.keys(countries)
        .sort()
        .forEach(function (c) {
          var opt = el("option", { value: c }, c);
          countrySel.appendChild(opt);
        });
      citySel.innerHTML = '<option value="all">All cities</option>';
      Object.keys(cities)
        .sort()
        .forEach(function (c) {
          var opt = el("option", { value: c }, c);
          citySel.appendChild(opt);
        });
      if (countries[keepCountry]) countrySel.value = keepCountry;
      if (cities[keepCity]) citySel.value = keepCity;
    }

    function renderCameraList() {
      var list = cameraPanel.querySelector('[data-cam="list"]');
      if (!list) return;
      var q = String(
        (cameraPanel.querySelector('[data-cam="q"]') || {}).value || ""
      ).toLowerCase();
      var typeFilter =
        (cameraPanel.querySelector('[data-cam="type"]') || {}).value || "all";
      var countryFilter =
        (cameraPanel.querySelector('[data-cam="country"]') || {}).value || "all";
      var cityFilter =
        (cameraPanel.querySelector('[data-cam="city"]') || {}).value || "all";
      var rows = state.cameras.filter(function (c) {
        if (typeFilter && typeFilter !== "all") {
          var cat = String(c.category || c.kind || "");
          if (cat !== typeFilter && c.kind !== typeFilter) return false;
        }
        if (countryFilter !== "all" && String(c.country || "") !== countryFilter) {
          return false;
        }
        if (cityFilter !== "all" && String(c.city || "") !== cityFilter) return false;
        if (!q) return true;
        return (
          String(c.name || "").toLowerCase().indexOf(q) >= 0 ||
          String(c.city || "").toLowerCase().indexOf(q) >= 0 ||
          String(c.country || "").toLowerCase().indexOf(q) >= 0 ||
          String(c.place || "").toLowerCase().indexOf(q) >= 0 ||
          String(c.category || "").toLowerCase().indexOf(q) >= 0 ||
          String(c.source || "").toLowerCase().indexOf(q) >= 0
        );
      });
      if (!rows.length) {
        list.textContent = "No licensed cameras match this filter / area.";
        return;
      }
      list.innerHTML = "";
      rows.slice(0, 40).forEach(function (cam) {
        var row = el("button", { type: "button" });
        row.style.cssText =
          "display:block;width:100%;text-align:start;margin:0 0 6px;padding:10px;min-height:44px;border:1px solid #c8e6c9;border-radius:8px;background:#f1f8e9;cursor:pointer;color:#1b5e20";
        var feedLabel =
          cam.feed_type === "jpeg_periodic" || cam.live_stream === false
            ? "periodic snapshot"
            : "LIVE video";
        row.textContent =
          (cam.live_stream ? "[LIVE] " : "[JPEG] ") +
          (cam.name || cam.id) +
          " · " +
          (cam.place || cam.city || "") +
          (cam.country ? ", " + cam.country : "") +
          " · " +
          feedLabel +
          (cam.attribution ? " · " + cam.attribution : "");
        row.addEventListener("click", function () {
          if (cam.latitude != null && cam.longitude != null) {
            map.setView([cam.latitude, cam.longitude], Math.max(map.getZoom(), 12));
          }
          openCamera(cam);
        });
        list.appendChild(row);
      });
    }

    function loadCameras(kind) {
      var mode = kind === "intersection" ? "intersection" : "live";
      var b = map.getBounds();
      var bbox = "";
      if (b) {
        var west = b.getWest();
        var south = b.getSouth();
        var east = b.getEast();
        var north = b.getNorth();
        var spanLon = Math.abs(east - west);
        var spanLat = Math.abs(north - south);
        /* Public camera API rejects spans > 25°. Ask user to zoom instead of raw error. */
        if (mode === "intersection" && (spanLon > 24.5 || spanLat > 24.5)) {
          cameraPanel.hidden = false;
          var honestyWide = cameraPanel.querySelector('[data-cam="honesty"]');
          if (honestyWide) {
            honestyWide.textContent =
              "Intersection snapshots need a closer map view (max ~25° span). Zoom into a city, then reopen this layer.";
          }
          setMeta(
            "Zoom in on the map to load licensed intersection snapshots (bbox max ~25°). No cameras invented."
          );
          return Promise.resolve(false);
        }
        bbox = west + "," + south + "," + east + "," + north;
      }
      setMeta(
        mode === "intersection"
          ? "Loading licensed intersection snapshots…"
          : "Loading curated live video webcams…"
      );
      cameraPanel.hidden = false;
      var honesty = cameraPanel.querySelector('[data-cam="honesty"]');
      if (honesty) {
        honesty.textContent =
          mode === "intersection"
            ? "Intersection layer: licensed JPEG snapshots only — never labeled as live video."
            : "Live video layer: curated official YouTube Live public webcams (embed). JPEG traffic cams stay on the intersection layer.";
      }
      var endpoint =
        mode === "intersection"
          ? "/api/map-public-cameras?kind=intersection&limit=50" +
            (bbox ? "&bbox=" + encodeURIComponent(bbox) : "")
          : "/api/map-live-videos?limit=40";
      return fetch(endpoint, { headers: { Accept: "application/json" } })
        .then(function (r) {
          return r.json();
        })
        .then(function (body) {
          if (state.cameraLayer && map.hasLayer(state.cameraLayer)) {
            map.removeLayer(state.cameraLayer);
          }
          state.cameraLayer = L.layerGroup();
          state.cameras = (body && body.cameras) || [];
          state.cameras.forEach(function (cam) {
            var lat = Number(cam.latitude);
            var lon = Number(cam.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
            var marker = L.circleMarker([lat, lon], {
              radius: 8,
              color: mode === "intersection" ? "#e65100" : "#1b5e20",
              fillColor: mode === "intersection" ? "#ff9800" : "#66bb6a",
              fillOpacity: 0.95,
              weight: 2
            });
            marker.bindTooltip(
              (cam.name || cam.id) +
                (cam.live_stream ? " · LIVE" : " · snapshot")
            );
            marker.bindPopup(
              "<strong>" +
                String(cam.name || cam.id).replace(/[<>&]/g, "") +
                "</strong><br>" +
                String(cam.city || "").replace(/[<>&]/g, "") +
                (cam.country ? ", " + String(cam.country).replace(/[<>&]/g, "") : "") +
                "<br>" +
                String(cam.attribution || "").replace(/[<>&]/g, "") +
                "<br><button type='button' data-open-cam='" +
                String(cam.id).replace(/'/g, "") +
                "'>" +
                (cam.live_stream ? "Play live video" : "View snapshot") +
                "</button>"
            );
            marker.on("popupopen", function () {
              var btn = document.querySelector('[data-open-cam="' + cam.id + '"]');
              if (btn) {
                btn.addEventListener("click", function () {
                  openCamera(cam);
                });
              }
            });
            marker.on("click", function () {
              openCamera(cam);
            });
            state.cameraLayer.addLayer(marker);
          });
          state.cameraLayer.addTo(map);
          fillCameraFilters();
          renderCameraList();
          var ok = state.cameras.length > 0;
          setMeta(
            ok
              ? mode === "intersection"
                ? "Intersection snapshots · " +
                  state.cameras.length +
                  " licensed JPEG feeds · Singapore LTA + commercialOk Datumfeed"
                : "Live video cams · " +
                  state.cameras.length +
                  " curated YouTube Live embeds · not JPEG snapshots"
              : (body && body.message) ||
                  (mode === "intersection"
                    ? "No licensed intersection cameras in this map area."
                    : "No curated live video cams available.")
          );
          return ok;
        })
        .catch(function () {
          setMeta(
            mode === "intersection"
              ? "Intersection camera directory is not available right now."
              : "Live video directory is not available right now."
          );
          return false;
        });
    }

    function loadTraffic() {
      setMeta("Checking traffic layer…");
      return fetch("/api/map-traffic", { headers: { Accept: "application/json" } })
        .then(function (r) {
          return r.json();
        })
        .then(function (body) {
          if (state.trafficLayer && map.hasLayer(state.trafficLayer)) {
            map.removeLayer(state.trafficLayer);
          }
          if (!body || !body.available || !body.tile_url_template) {
            state.trafficOn = false;
            markToggle("traffic", false);
            setMeta(
              (body && body.message) ||
                "Live traffic flow is not enabled (TOMTOM_API_KEY required)."
            );
            return false;
          }
          state.trafficLayer = L.tileLayer(body.tile_url_template, {
            maxZoom: body.max_zoom || 22,
            opacity: 0.75,
            attribution: body.attribution || "Traffic"
          });
          state.trafficLayer.addTo(map);
          state.trafficOn = true;
          markToggle("traffic", true);
          setMeta(body.message || "Live traffic flow enabled.");
          return true;
        })
        .catch(function () {
          setMeta("Traffic status is not available right now.");
          return false;
        });
    }

    function setBase(mode) {
      if (!api || typeof api.setBaseLayer !== "function") {
        markBase(mode);
        state.base = mode;
        return Promise.resolve(mode);
      }
      /* live base = street tiles + rain + public camera markers (not old satellite) */
      var req = mode === "live" ? "street" : mode;
      return Promise.resolve(api.setBaseLayer(req)).then(function (result) {
        var applied =
          typeof result === "string"
            ? result
            : (result && result.mode) || req;
        state.base = mode === "live" ? "live" : applied;
        markBase(state.base === "live" ? "live" : applied);
        if (mode === "live") {
          state.camerasOn = true;
          markToggle("cameras", true);
          return loadRain().then(function (rainOk) {
            return loadCameras("live").then(function (camOk) {
              setMeta(
                "Live map · rain " +
                  (rainOk ? "on" : "unavailable") +
                  " · live video cams " +
                  (camOk ? "on" : "none") +
                  " · satellite imagery is never labeled live"
              );
              return "live";
            });
          });
        }
        return applied;
      });
    }

    Object.keys(buttons).forEach(function (key) {
      buttons[key].addEventListener("click", function () {
        if (key === "street" || key === "satellite" || key === "hybrid") {
          clearRainLayers();
          state.rainOn = false;
          markToggle("rain", false);
          rainPanel.hidden = true;
          setBase(key).then(function () {
            setMeta(
              key === "street"
                ? "Street map · OpenStreetMap"
                : "Satellite / hybrid · Esri static imagery (not a live camera)"
            );
          });
          return;
        }
        if (key === "live") {
          setBase("live");
          return;
        }
        if (key === "rain") {
          if (state.rainOn) {
            clearRainLayers();
            state.rainOn = false;
            markToggle("rain", false);
            rainPanel.hidden = true;
            setMeta("Rain radar off.");
          } else {
            loadRain();
          }
          return;
        }
        if (key === "cameras") {
          state.camerasOn = !state.camerasOn;
          markToggle("cameras", state.camerasOn);
          if (!state.camerasOn) {
            if (state.cameraLayer && map.hasLayer(state.cameraLayer)) {
              map.removeLayer(state.cameraLayer);
            }
            cameraPanel.hidden = true;
            setMeta("Live video cams off.");
            closeCameraViewer();
            return;
          }
          state.intersectionOn = false;
          markToggle("intersection", false);
          loadCameras("live");
          return;
        }
        if (key === "intersection") {
          state.intersectionOn = !state.intersectionOn;
          markToggle("intersection", state.intersectionOn);
          if (!state.intersectionOn) {
            if (state.cameraLayer && map.hasLayer(state.cameraLayer)) {
              map.removeLayer(state.cameraLayer);
            }
            cameraPanel.hidden = true;
            setMeta("Intersection snapshots off.");
            closeCameraViewer();
            return;
          }
          state.camerasOn = false;
          markToggle("cameras", false);
          loadCameras("intersection");
          return;
        }
        if (key === "traffic") {
          if (state.trafficOn) {
            if (state.trafficLayer && map.hasLayer(state.trafficLayer)) {
              map.removeLayer(state.trafficLayer);
            }
            state.trafficOn = false;
            markToggle("traffic", false);
            setMeta("Traffic status off.");
            return;
          }
          loadTraffic();
        }
      });
    });

    rainPanel.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-rain]");
      if (!btn) return;
      var action = btn.getAttribute("data-rain");
      if (action === "prev") applyRainFrame(state.rainIndex - 1);
      if (action === "next") applyRainFrame(state.rainIndex + 1);
      if (action === "pause" && state.rainTimer) {
        clearInterval(state.rainTimer);
        state.rainTimer = null;
      }
      if (action === "play") {
        if (state.rainTimer) clearInterval(state.rainTimer);
        state.rainTimer = setInterval(function () {
          var next = state.rainIndex + 1;
          if (next >= state.rainFrames.length) next = 0;
          applyRainFrame(next);
        }, 700);
      }
    });
    var scrub = rainPanel.querySelector('[data-rain="scrub"]');
    if (scrub) {
      scrub.addEventListener("input", function () {
        applyRainFrame(Number(scrub.value || 0));
      });
    }

    ["q", "type", "country", "city"].forEach(function (key) {
      var node = cameraPanel.querySelector('[data-cam="' + key + '"]');
      if (!node) return;
      node.addEventListener(key === "q" ? "input" : "change", function () {
        renderCameraList();
      });
    });
    viewer.querySelector('[data-cam="close"]').addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      closeCameraViewer();
    });
    var playBtn = viewer.querySelector('[data-cam="play"]');
    var pauseBtn = viewer.querySelector('[data-cam="pause"]');
    var fsBtn = viewer.querySelector('[data-cam="fullscreen"]');
    if (playBtn) {
      playBtn.addEventListener("click", function (event) {
        event.preventDefault();
        ytCommand("playVideo");
      });
    }
    if (pauseBtn) {
      pauseBtn.addEventListener("click", function (event) {
        event.preventDefault();
        ytCommand("pauseVideo");
      });
    }
    if (fsBtn) {
      fsBtn.addEventListener("click", function (event) {
        event.preventDefault();
        var media = viewer.querySelector('[data-cam="media"]');
        if (!media) return;
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(function () {});
          return;
        }
        if (media.requestFullscreen) {
          media.requestFullscreen().catch(function () {});
        }
      });
    }
    viewer.addEventListener("click", function (event) {
      if (event.target === viewer) closeCameraViewer();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && viewer.style.display === "flex") {
        closeCameraViewer();
      }
    });
    closeCameraViewer();

    map.on("moveend", function () {
      /* Live video list is curated globally — do not refetch on every pan.
         Intersection JPEG feeds are bbox-scoped. */
      if (state.intersectionOn) loadCameras("intersection");
    });

    return {
      ok: true,
      state: state,
      reloadCameras: loadCameras,
      reloadRain: loadRain
    };
  }

  root.HAVKAR_MAP_LIVE_LAYERS = {
    attachLayerMenu: attachLayerMenu
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
