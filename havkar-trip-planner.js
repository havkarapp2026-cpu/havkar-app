/**
 * Multi-stop trip planner UI for Tickets + Accommodation.
 * Uses /api/map-trip-plan (TomTom). Saves plans locally; never invents ETAs.
 * Share export strips personal/ticket details.
 */
(function (global) {
  "use strict";

  var root = global;
  var STORAGE_KEY = "havkar_trip_plan_v1";
  var MAX_STOPS = 8;

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
    } catch (_e2) {}
    return "ltr";
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "className") node.className = attrs[k];
        else if (k === "hidden") node.hidden = Boolean(attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function loadPlan() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { stops: [], updated_at: null };
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.stops)) return { stops: [], updated_at: null };
      return parsed;
    } catch (_e) {
      return { stops: [], updated_at: null };
    }
  }

  function savePlan(plan) {
    try {
      global.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          stops: plan.stops || [],
          updated_at: new Date().toISOString()
        })
      );
    } catch (_e) {}
  }

  function formatDuration(sec) {
    if (!Number.isFinite(sec)) return "—";
    var m = Math.round(sec / 60);
    if (m < 60) return m + " min";
    return Math.floor(m / 60) + " h " + (m % 60) + " min";
  }

  function formatKm(meters) {
    if (!Number.isFinite(meters)) return "—";
    return (meters / 1000).toFixed(1) + " km";
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

  function ensureCss() {
    if (document.getElementById("havkar-trip-planner-css")) return;
    var link = document.createElement("link");
    link.id = "havkar-trip-planner-css";
    link.rel = "stylesheet";
    link.href = "/havkar-trip-planner.css";
    document.head.appendChild(link);
  }

  function mount(opts) {
    opts = opts || {};
    ensureCss();
    var host =
      document.getElementById(opts.hostId || "havkarTripPlanner") ||
      (function () {
        var panel = el("section", {
          id: "havkarTripPlanner",
          className: "havkar-trip-planner",
          "aria-label": mt("maps.trip_title")
        });
        var anchor =
          document.getElementById(opts.insertBeforeId || "") ||
          document.getElementById("accMapShell") ||
          document.getElementById("ticketsMapShell") ||
          document.querySelector("main");
        if (anchor && anchor.parentNode) {
          if (anchor.nextSibling) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
          else anchor.parentNode.appendChild(panel);
        } else {
          document.body.appendChild(panel);
        }
        return panel;
      })();

    var plan = loadPlan();
    var lastRoute = null;

    function render() {
      host.innerHTML = "";
      host.setAttribute("dir", mapDir());
      host.setAttribute("lang", (root.HAVKAR_MAP_I18N && root.HAVKAR_MAP_I18N.lang && root.HAVKAR_MAP_I18N.lang()) || "en");
      host.appendChild(el("h2", { className: "havkar-trip-title", "data-i18n-map": "maps.trip_title" }, mt("maps.trip_title")));
      host.appendChild(
        el(
          "p",
          { className: "havkar-trip-note", "data-i18n-map": "maps.trip_note" },
          mt("maps.trip_note")
        )
      );

      var list = el("ol", { className: "havkar-trip-stops", "data-trip": "list" });
      if (!plan.stops.length) {
        list.appendChild(
          el("li", { className: "havkar-trip-empty", "data-i18n-map": "maps.trip_empty" }, mt("maps.trip_empty"))
        );
      } else {
        plan.stops.forEach(function (stop, idx) {
          var li = el("li", { className: "havkar-trip-stop" });
          li.appendChild(
            el(
              "strong",
              null,
              (idx + 1) + ". " + (stop.label || "Stop") + (stop.kind ? " · " + stop.kind : "")
            )
          );
          li.appendChild(
            el(
              "span",
              { className: "havkar-trip-coords" },
              Number(stop.lat).toFixed(5) + ", " + Number(stop.lng).toFixed(5)
            )
          );
          var row = el("div", { className: "havkar-trip-stop-actions" });
          var up = el("button", { type: "button" }, mt("maps.up"));
          up.disabled = idx === 0;
          up.addEventListener("click", function () {
            if (idx === 0) return;
            var tmp = plan.stops[idx - 1];
            plan.stops[idx - 1] = plan.stops[idx];
            plan.stops[idx] = tmp;
            savePlan(plan);
            render();
          });
          var down = el("button", { type: "button" }, mt("maps.down"));
          down.disabled = idx === plan.stops.length - 1;
          down.addEventListener("click", function () {
            if (idx >= plan.stops.length - 1) return;
            var tmp2 = plan.stops[idx + 1];
            plan.stops[idx + 1] = plan.stops[idx];
            plan.stops[idx] = tmp2;
            savePlan(plan);
            render();
          });
          var rm = el("button", { type: "button" }, mt("maps.remove"));
          rm.addEventListener("click", function () {
            plan.stops.splice(idx, 1);
            savePlan(plan);
            render();
          });
          row.appendChild(up);
          row.appendChild(down);
          row.appendChild(rm);
          li.appendChild(row);
          list.appendChild(li);
        });
      }
      host.appendChild(list);

      var tools = el("div", { className: "havkar-trip-tools" });
      var mode = el("select", { "aria-label": "Travel mode", "data-trip": "mode" });
      [
        ["driving", mt("maps.driving")],
        ["walking", mt("maps.walking")],
        ["cycling", mt("maps.cycling")]
      ].forEach(function (pair) {
        mode.appendChild(el("option", { value: pair[0] }, pair[1]));
      });
      tools.appendChild(mode);

      var status = el("p", { className: "havkar-trip-status", role: "status", "data-trip": "status" }, "");
      var routeBtn = el("button", { type: "button", className: "primary" }, mt("maps.calculate_route"));
      routeBtn.disabled = plan.stops.length < 2;
      routeBtn.addEventListener("click", function () {
        calculate(mode.value, status, resultBox);
      });
      tools.appendChild(routeBtn);

      var clearBtn = el("button", { type: "button" }, mt("maps.clear_plan"));
      clearBtn.addEventListener("click", function () {
        plan = { stops: [], updated_at: null };
        lastRoute = null;
        savePlan(plan);
        render();
      });
      tools.appendChild(clearBtn);

      var shareBtn = el("button", { type: "button" }, mt("maps.copy_share"));
      shareBtn.addEventListener("click", function () {
        var labels = plan.stops.map(function (s, i) {
          return i + 1 + ". " + (s.label || "Stop");
        });
        var text =
          "HAVKAR trip plan (" +
          labels.length +
          " stops)\n" +
          labels.join("\n") +
          "\n— Labels only; no live location or ticket details.";
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () {
              status.textContent = mt("maps.msg_share_copied");
            },
            function () {
              status.textContent = text;
            }
          );
        } else {
          status.textContent = text;
        }
      });
      tools.appendChild(shareBtn);
      host.appendChild(tools);
      host.appendChild(status);

      var resultBox = el("div", { className: "havkar-trip-result", "data-trip": "result" });
      if (lastRoute && lastRoute.ok) {
        resultBox.appendChild(
          el(
            "p",
            null,
            "Total · " +
              formatKm(lastRoute.distance_m) +
              " · " +
              formatDuration(lastRoute.duration_s) +
              (lastRoute.traffic_delay_s
                ? " · traffic delay " + formatDuration(lastRoute.traffic_delay_s)
                : "")
          )
        );
        if (lastRoute.traffic_alert) {
          resultBox.appendChild(
            el(
              "p",
              { className: "havkar-trip-alert" },
              lastRoute.traffic_alert.message +
                (formatPublicClock(
                  lastRoute.traffic_alert.last_updated || lastRoute.last_updated || ""
                )
                  ? " · " +
                    formatPublicClock(
                      lastRoute.traffic_alert.last_updated || lastRoute.last_updated || ""
                    )
                  : "")
            )
          );
        }
        (lastRoute.legs || []).forEach(function (leg, i) {
          resultBox.appendChild(
            el(
              "p",
              null,
              "Leg " +
                (i + 1) +
                ": " +
                ((leg.from && leg.from.label) || "?") +
                " → " +
                ((leg.to && leg.to.label) || "?") +
                " · " +
                formatKm(leg.distance_m) +
                " · " +
                formatDuration(leg.duration_s)
            )
          );
        });
        resultBox.appendChild(
          el(
            "p",
            { className: "havkar-trip-meta" },
            "TomTom" +
              (formatPublicClock(lastRoute.last_updated)
                ? " · " + formatPublicClock(lastRoute.last_updated)
                : "")
          )
        );
        if (opts.mapApi && lastRoute.geometry && Array.isArray(lastRoute.geometry.coordinates)) {
          try {
            if (typeof opts.mapApi.drawRoute === "function") {
              opts.mapApi.drawRoute(lastRoute.geometry.coordinates);
            } else if (opts.mapApi.setRoute) {
              opts.mapApi.setRoute(lastRoute.geometry);
            }
          } catch (_e) {}
        }
      }
      host.appendChild(resultBox);

      var plus = el("p", { className: "havkar-trip-plus" }, mt("maps.travel_plus_loading"));
      host.appendChild(plus);
      fetch("/api/map-travel-plus-status")
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          plus.textContent =
            (j && j.message) ||
            mt("maps.travel_plus_off");
        })
        .catch(function () {
          plus.textContent = "Travel Plus status unavailable · sales remain OFF.";
        });
    }

    function calculate(profile, statusEl, _resultBox) {
      if (plan.stops.length < 2) {
        statusEl.textContent = mt("maps.msg_add_two_stops");
        return;
      }
      statusEl.textContent = mt("maps.msg_calc_route");
      fetch("/api/map-trip-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          profile: profile,
          stops: plan.stops.map(function (s) {
            return {
              lat: s.lat,
              lng: s.lng,
              label: s.label,
              kind: s.kind
            };
          })
        })
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          if (!j || !j.ok) {
            lastRoute = null;
            statusEl.textContent =
              (j && (j.message || j.error)) ||
              "Route unavailable. TomTom may lack coverage for these waypoints.";
            render();
            return;
          }
          lastRoute = j;
          statusEl.textContent = mt("maps.msg_route_ready");
          render();
        })
        .catch(function () {
          lastRoute = null;
          statusEl.textContent = mt("maps.msg_network_route");
          render();
        });
    }

    function onLang() {
      render();
    }
    document.addEventListener("havkar:i18n-ready", onLang);
    document.addEventListener("havkar:language-changed", onLang);
    if (root.HAVKAR_MAP_I18N && root.HAVKAR_MAP_I18N.onChange) {
      root.HAVKAR_MAP_I18N.onChange(onLang);
    }

    render();

    return {
      addStop: function (stop) {
        if (!stop) return false;
        var lat = Number(stop.lat != null ? stop.lat : stop.latitude);
        var lng = Number(stop.lng != null ? stop.lng : stop.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
        if (plan.stops.length >= MAX_STOPS) return false;
        var label = String(stop.label || stop.name || mt("maps.map_center")).slice(0, 120);
        plan.stops.push({
          lat: lat,
          lng: lng,
          label: label,
          kind: String(stop.kind || stop.type || "place").slice(0, 40)
        });
        savePlan(plan);
        render();
        var statusEl = host.querySelector('[data-trip="status"]');
        var signedIn = false;
        try {
          signedIn = !!(
            global.__HAVKAR_SESSION_USER ||
            (global.HAVKAR_AUTH && global.HAVKAR_AUTH.user) ||
            global.localStorage.getItem("havkar_user_id")
          );
        } catch (_auth) {}
        if (statusEl) {
          statusEl.textContent = signedIn
            ? mt("maps.msg_trip_stop_saved", { label: label })
            : mt("maps.msg_trip_saved_device", { label: label });
        }
        try {
          host.classList.add("havkar-trip-flash");
          host.scrollIntoView({ behavior: "smooth", block: "nearest" });
          setTimeout(function () {
            host.classList.remove("havkar-trip-flash");
          }, 1800);
        } catch (_e) {}
        return true;
      },
      getStops: function () {
        return plan.stops.slice();
      },
      refresh: render
    };
  }

  global.HAVKAR_TRIP_PLANNER = {
    mount: mount,
    loadPlan: loadPlan,
    savePlan: savePlan,
    STORAGE_KEY: STORAGE_KEY
  };
})(typeof window !== "undefined" ? window : globalThis);
