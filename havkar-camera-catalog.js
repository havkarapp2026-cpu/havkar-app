/**
 * Client catalog of licensed public camera sources (mirrors lib/map-camera-sources.cjs).
 * Never invent coverage. JPEG periodic ≠ LIVE video.
 */
(function (root) {
  "use strict";
  var SOURCES = [
    {
      id: "youtube-curated-live",
      kind: "youtube_live",
      label: "Curated YouTube Live",
      categories: ["city", "tourism"],
      countries: ["IT", "JP", "US", "FR"],
      live_policy: "Only probe-confirmed LIVE streams are labeled LIVE.",
      coverage: "Curated public tourism/street livestreams",
      playback: "true_live_video"
    },
    {
      id: "singapore-lta",
      kind: "jpeg_periodic",
      label: "Singapore LTA roads",
      categories: ["road", "highway"],
      countries: ["SG"],
      live_policy: "Periodic JPEG — never labeled LIVE.",
      coverage: "Singapore expressways / roads",
      playback: "periodic_jpeg"
    },
    {
      id: "digitraffic-finland",
      kind: "jpeg_periodic",
      label: "Finland Digitraffic",
      categories: ["road", "weather"],
      countries: ["FI"],
      live_policy: "Periodic JPEG — never labeled LIVE.",
      coverage: "Finland road weather cameras",
      playback: "periodic_jpeg"
    },
    {
      id: "calgary-traffic",
      kind: "jpeg_periodic",
      label: "Calgary traffic",
      categories: ["road", "intersection"],
      countries: ["CA"],
      live_policy: "Periodic JPEG — never labeled LIVE.",
      coverage: "Calgary traffic cameras",
      playback: "periodic_jpeg"
    },
    {
      id: "datumfeed-commercial",
      kind: "jpeg_poll",
      label: "Datumfeed open registries",
      categories: ["road", "city"],
      countries: ["US", "CA", "GB"],
      live_policy: "Periodic JPEG (Austin / Ontario / TfL JamCams / Toronto) — never labeled LIVE.",
      coverage: "Open registries with commercialOk only",
      playback: "polled_jpeg"
    }
  ];

  function search(query, filters) {
    filters = filters || {};
    var q = String(query || "")
      .trim()
      .toLowerCase();
    var kind = String(filters.kind || "").trim();
    var category = String(filters.category || "").trim().toLowerCase();
    return SOURCES.filter(function (s) {
      if (kind && s.kind !== kind) return false;
      if (category && (s.categories || []).indexOf(category) === -1) {
        /* highway maps to road */
        if (!(category === "highway" && (s.categories || []).indexOf("road") !== -1)) {
          return false;
        }
      }
      if (!q) return true;
      return (
        (s.id +
          " " +
          s.label +
          " " +
          s.coverage +
          " " +
          (s.countries || []).join(" ") +
          " " +
          (s.categories || []).join(" ") +
          " " +
          (s.playback || ""))
          .toLowerCase()
          .indexOf(q) !== -1
      );
    });
  }

  root.HAVKAR_CAMERA_CATALOG = {
    sources: SOURCES.slice(),
    search: search,
    kinds: {
      youtube_live: "True LIVE video (probe-confirmed)",
      jpeg_periodic: "Periodic JPEG — not LIVE",
      jpeg_poll: "Polled JPEG — not LIVE"
    },
    honesty:
      "New camera sources require Owner license/ToS/geo review before addition. Private or fake LIVE feeds are refused."
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
