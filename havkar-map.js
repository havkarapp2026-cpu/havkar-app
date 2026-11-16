/**
 * Shared HAVKAR map helper (Leaflet + OSM tiles).
 * Supports clustering, bounds filtering, Nominatim geocode (via /api/hotels),
 * OSRM routing links, distance helpers, and map/list sync.
 * Google Maps is used only when a licensed client key is provided by the host page.
 * Never fabricates coordinates, routes, distances or availability.
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
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
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

  function ensureMarkerCluster(L, cb) {
    if (L.markerClusterGroup) {
      cb(null);
      return;
    }
    if (!document.querySelector('link[data-havkar-cluster-css="1"]')) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href =
        "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css";
      link.setAttribute("data-havkar-cluster-css", "1");
      document.head.appendChild(link);
      var link2 = document.createElement("link");
      link2.rel = "stylesheet";
      link2.href =
        "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css";
      link2.setAttribute("data-havkar-cluster-default-css", "1");
      document.head.appendChild(link2);
    }
    var existing = document.querySelector('script[data-havkar-cluster="1"]');
    if (existing) {
      existing.addEventListener("load", function () {
        cb(L.markerClusterGroup ? null : new Error("cluster_load_failed"));
      });
      return;
    }
    var script = document.createElement("script");
    script.src =
      "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js";
    script.setAttribute("data-havkar-cluster", "1");
    script.onload = function () {
      cb(L.markerClusterGroup ? null : new Error("cluster_load_failed"));
    };
    script.onerror = function () {
      cb(new Error("cluster_script_failed"));
    };
    document.head.appendChild(script);
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    var toRad = function (d) {
      return (Number(d) * Math.PI) / 180;
    };
    var R = 6371;
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function osmDirectionsUrl(lat, lng) {
    return (
      "https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=;" +
      encodeURIComponent(Number(lat) + "," + Number(lng))
    );
  }

  function osrmRouteUrl(fromLat, fromLng, toLat, toLng) {
    return (
      "https://router.project-osrm.org/route/v1/driving/" +
      Number(fromLng) +
      "," +
      Number(fromLat) +
      ";" +
      Number(toLng) +
      "," +
      Number(toLat) +
      "?overview=false"
    );
  }

  async function geocodeQuery(query) {
    var q = String(query || "").trim();
    if (q.length < 2) {
      return { ok: false, error: "query_too_short" };
    }
    var res = await fetch("/api/hotels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "hotels_geocode", query: q })
    });
    var body = await res.json().catch(function () {
      return null;
    });
    if (!body || body.ok !== true) {
      return {
        ok: false,
        error: (body && body.error) || "geocode_failed",
        results: (body && body.results) || []
      };
    }
    return body;
  }

  function createMap(container, options) {
    var opts = options || {};
    var lat = Number(opts.latitude);
    var lng = Number(opts.longitude);
    if (!Number.isFinite(lat)) lat = 41.8933203;
    if (!Number.isFinite(lng)) lng = 12.4829321;
    var zoom = Number(opts.zoom);
    if (!Number.isFinite(zoom)) zoom = 11;
    var useCluster = opts.cluster !== false;

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

        function finish(clusterReady) {
          var map = L.map(el, {
            scrollWheelZoom: true,
            tap: true
          }).setView([lat, lng], zoom);
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: "&copy; OpenStreetMap"
          }).addTo(map);
          var centerMarker = L.marker([lat, lng]).addTo(map);
          var pinLayer = null;
          var pinIndex = Object.create(null);
          var selectedId = null;
          var onBoundsSearch = typeof opts.onBoundsSearch === "function"
            ? opts.onBoundsSearch
            : null;
          var onSelect = typeof opts.onSelect === "function" ? opts.onSelect : null;

          if (clusterReady && L.markerClusterGroup) {
            pinLayer = L.markerClusterGroup({
              showCoverageOnHover: false,
              maxClusterRadius: 48,
              spiderfyOnMaxZoom: true
            });
          } else {
            pinLayer = L.layerGroup();
          }
          pinLayer.addTo(map);

          var api = {
            map: map,
            marker: centerMarker,
            L: L,
            layer: pinLayer,
            haversineKm: haversineKm,
            geocode: geocodeQuery,
            osmDirectionsUrl: osmDirectionsUrl,
            setCenter: function (nextLat, nextLng, nextZoom) {
              var ll = [Number(nextLat), Number(nextLng)];
              centerMarker.setLatLng(ll);
              map.setView(ll, Number.isFinite(nextZoom) ? nextZoom : map.getZoom());
            },
            clearPins: function () {
              pinLayer.clearLayers();
              pinIndex = Object.create(null);
              selectedId = null;
            },
            addPricePin: function (pinLat, pinLng, label, meta) {
              var info = meta || {};
              var m = L.circleMarker([pinLat, pinLng], {
                radius: info.selected ? 10 : 8,
                color: info.selected ? "#0d47a1" : "#1b5e20",
                fillColor: info.selected ? "#42a5f5" : "#66bb6a",
                fillOpacity: 0.9,
                weight: 2
              }).bindPopup(String(label || "Location"));
              if (info.id != null) {
                pinIndex[String(info.id)] = m;
                m.on("click", function () {
                  selectedId = String(info.id);
                  if (onSelect) onSelect(info);
                });
              }
              pinLayer.addLayer(m);
              return m;
            },
            setMarkers: function (items, options2) {
              var o = options2 || {};
              api.clearPins();
              var list = Array.isArray(items) ? items : [];
              var bounds = [];
              list.forEach(function (item) {
                var plat = Number(item.latitude != null ? item.latitude : item.lat);
                var plng = Number(item.longitude != null ? item.longitude : item.lng);
                if (!Number.isFinite(plat) || !Number.isFinite(plng)) return;
                bounds.push([plat, plng]);
                api.addPricePin(
                  plat,
                  plng,
                  item.label || item.title || item.display_name || "Location",
                  {
                    id: item.id,
                    selected: selectedId && String(item.id) === selectedId,
                    raw: item
                  }
                );
              });
              if (o.fit !== false && bounds.length) {
                try {
                  map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
                } catch (_e) {}
              }
              return bounds.length;
            },
            getBoundsFilter: function () {
              var b = map.getBounds();
              if (!b) return null;
              return {
                north: b.getNorth(),
                south: b.getSouth(),
                east: b.getEast(),
                west: b.getWest()
              };
            },
            filterItemsInBounds: function (items) {
              var b = api.getBoundsFilter();
              if (!b) return Array.isArray(items) ? items.slice() : [];
              return (items || []).filter(function (item) {
                var plat = Number(item.latitude != null ? item.latitude : item.lat);
                var plng = Number(item.longitude != null ? item.longitude : item.lng);
                if (!Number.isFinite(plat) || !Number.isFinite(plng)) return false;
                return (
                  plat <= b.north &&
                  plat >= b.south &&
                  plng <= b.east &&
                  plng >= b.west
                );
              });
            },
            filterByDistanceKm: function (items, centerLat, centerLng, maxKm) {
              var max = Number(maxKm);
              if (!Number.isFinite(max) || max <= 0) {
                return Array.isArray(items) ? items.slice() : [];
              }
              return (items || []).filter(function (item) {
                var plat = Number(item.latitude != null ? item.latitude : item.lat);
                var plng = Number(item.longitude != null ? item.longitude : item.lng);
                if (!Number.isFinite(plat) || !Number.isFinite(plng)) return false;
                return (
                  haversineKm(centerLat, centerLng, plat, plng) <= max
                );
              });
            },
            highlight: function (id) {
              selectedId = id == null ? null : String(id);
              Object.keys(pinIndex).forEach(function (key) {
                var m = pinIndex[key];
                if (!m || !m.setStyle) return;
                var on = selectedId && key === selectedId;
                m.setStyle({
                  radius: on ? 10 : 8,
                  color: on ? "#0d47a1" : "#1b5e20",
                  fillColor: on ? "#42a5f5" : "#66bb6a"
                });
                if (on && m.openPopup) m.openPopup();
              });
            },
            searchPlace: function (query) {
              return geocodeQuery(query).then(function (geo) {
                if (!geo.ok || !geo.primary) return geo;
                api.setCenter(geo.primary.latitude, geo.primary.longitude, 12);
                return geo;
              });
            },
            searchThisArea: function () {
              var bounds = api.getBoundsFilter();
              if (onBoundsSearch) onBoundsSearch(bounds);
              return bounds;
            },
            requestRoute: async function (toLat, toLng) {
              var from = centerMarker.getLatLng();
              var url = osrmRouteUrl(from.lat, from.lng, toLat, toLng);
              try {
                var res = await fetch(url, {
                  headers: { Accept: "application/json" }
                });
                var body = await res.json();
                var route = body && body.routes && body.routes[0];
                if (!route) {
                  return {
                    ok: false,
                    error: "route_unavailable",
                    directions_url: osmDirectionsUrl(toLat, toLng)
                  };
                }
                return {
                  ok: true,
                  provider: "osrm",
                  distance_m: route.distance,
                  duration_s: route.duration,
                  directions_url: osmDirectionsUrl(toLat, toLng)
                };
              } catch (_e) {
                return {
                  ok: false,
                  error: "route_network_error",
                  directions_url: osmDirectionsUrl(toLat, toLng)
                };
              }
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

          if (opts.bindSearchAreaButton) {
            var btn =
              typeof opts.bindSearchAreaButton === "string"
                ? document.getElementById(opts.bindSearchAreaButton)
                : opts.bindSearchAreaButton;
            if (btn) {
              btn.addEventListener("click", function () {
                api.searchThisArea();
              });
            }
          }

          resolve(api);
        }

        if (useCluster) {
          ensureMarkerCluster(L, function (clusterErr) {
            finish(!clusterErr);
          });
        } else {
          finish(false);
        }
      });
    });
  }

  root.HAVKAR_MAP = {
    create: createMap,
    ensureLeaflet: ensureLeaflet,
    geocode: geocodeQuery,
    haversineKm: haversineKm,
    osmDirectionsUrl: osmDirectionsUrl
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
