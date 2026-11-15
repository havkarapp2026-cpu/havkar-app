/**
 * Shared HAVKAR map helper (Leaflet + OSM tiles).
 * Google Maps is used only when a licensed client key is provided by the host page.
 * Never fabricates vehicle locations or ETAs.
 */
(function (root) {
  "use strict";

  function ensureLeaflet(cb) {
    if (root.L) {
      cb(null, root.L);
      return;
    }
    var existing = document.querySelector('script[data-havkar-leaflet="1"]');
    if (existing) {
      existing.addEventListener("load", function () {
        cb(root.L ? null : new Error("leaflet_load_failed"), root.L);
      });
      return;
    }
    if (!document.querySelector('link[data-havkar-leaflet-css="1"]')) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href =
        "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.setAttribute("data-havkar-leaflet-css", "1");
      document.head.appendChild(link);
    }
    var script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.setAttribute("data-havkar-leaflet", "1");
    script.onload = function () {
      cb(root.L ? null : new Error("leaflet_load_failed"), root.L);
    };
    script.onerror = function () {
      cb(new Error("leaflet_script_failed"));
    };
    document.head.appendChild(script);
  }

  function createMap(container, options) {
    var opts = options || {};
    var lat = Number(opts.latitude);
    var lng = Number(opts.longitude);
    if (!Number.isFinite(lat)) lat = 41.8933203;
    if (!Number.isFinite(lng)) lng = 12.4829321;
    var zoom = Number(opts.zoom);
    if (!Number.isFinite(zoom)) zoom = 11;

    return new Promise(function (resolve, reject) {
      ensureLeaflet(function (err, L) {
        if (err || !L) {
          reject(err || new Error("leaflet_unavailable"));
          return;
        }
        var el =
          typeof container === "string"
            ? document.getElementById(container)
            : container;
        if (!el) {
          reject(new Error("map_container_missing"));
          return;
        }
        var map = L.map(el).setView([lat, lng], zoom);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "&copy; OpenStreetMap"
        }).addTo(map);
        var marker = L.marker([lat, lng]).addTo(map);
        var api = {
          map: map,
          marker: marker,
          L: L,
          setCenter: function (nextLat, nextLng, nextZoom) {
            var ll = [Number(nextLat), Number(nextLng)];
            marker.setLatLng(ll);
            map.setView(ll, Number.isFinite(nextZoom) ? nextZoom : map.getZoom());
          },
          addPricePin: function (pinLat, pinLng, label) {
            return L.circleMarker([pinLat, pinLng], {
              radius: 8,
              color: "#1b5e20",
              fillColor: "#66bb6a",
              fillOpacity: 0.85
            })
              .addTo(map)
              .bindPopup(String(label || "Location"));
          },
          requestGps: function () {
            return new Promise(function (res, rej) {
              if (!navigator.geolocation) {
                rej(new Error("geolocation_unavailable"));
                return;
              }
              navigator.geolocation.getCurrentPosition(
                function (pos) {
                  api.setCenter(pos.coords.latitude, pos.coords.longitude, 13);
                  res({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy
                  });
                },
                function (geoErr) {
                  rej(geoErr || new Error("geolocation_denied"));
                },
                { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
              );
            });
          },
          googleMapsStatus: function () {
            var key = String(opts.googleMapsApiKey || "").trim();
            return {
              configured: Boolean(key),
              provider: key ? "google_maps" : "openstreetmap",
              note: key
                ? "Host supplied a Google Maps key; page must load Maps JS separately."
                : "No Google Maps key configured. Using OpenStreetMap tiles."
            };
          },
          invalidate: function () {
            setTimeout(function () {
              map.invalidateSize();
            }, 50);
          }
        };
        resolve(api);
      });
    });
  }

  root.HAVKAR_MAP = {
    create: createMap,
    ensureLeaflet: ensureLeaflet
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
