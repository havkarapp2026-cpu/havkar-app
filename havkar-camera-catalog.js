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
      coverage: "Curated public tourism/street livestreams"
    },
    {
      id: "singapore-lta",
      kind: "jpeg_periodic",
      label: "Singapore LTA roads",
      categories: ["road", "highway"],
      countries: ["SG"],
      live_policy: "Periodic JPEG — never labeled LIVE.",
      coverage: "Singapore expressways / roads"
    },
    {
      id: "digitraffic-finland",
      kind: "jpeg_periodic",
      label: "Finland Digitraffic",
      categories: ["road", "weather"],
      countries: ["FI"],
      live_policy: "Periodic JPEG — never labeled LIVE.",
      coverage: "Finland road weather cameras"
    },
    {
      id: "calgary-traffic",
      kind: "jpeg_periodic",
      label: "Calgary traffic",
      categories: ["road", "intersection"],
      countries: ["CA"],
      live_policy: "Periodic JPEG — never labeled LIVE.",
      coverage: "Calgary traffic cameras"
    },
    {
      id: "datumfeed-commercial",
      kind: "jpeg_poll",
      label: "Datumfeed open registries",
      categories: ["road", "city"],
      countries: ["US", "CA", "GB"],
      live_policy: "Periodic JPEG (Austin / Ontario / TfL JamCams / Toronto) — never labeled LIVE.",
      coverage: "Open registries with commercialOk only"
    }
  ];

  root.HAVKAR_CAMERA_CATALOG = {
    sources: SOURCES.slice(),
    search: function (query) {
      var q = String(query || "")
        .trim()
        .toLowerCase();
      if (!q) return SOURCES.slice();
      return SOURCES.filter(function (s) {
        return (
          (s.id + " " + s.label + " " + s.coverage + " " + (s.countries || []).join(" ") + " " + (s.categories || []).join(" "))
            .toLowerCase()
            .indexOf(q) !== -1
        );
      });
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
