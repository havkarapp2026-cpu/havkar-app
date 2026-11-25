/**
 * Manageable registry of licensed public camera sources for HAVKAR maps.
 * Add / disable sources here — never invent coverage or private cameras.
 * Paid/commercial APIs stay disabled until Owner arms a key and approves cost.
 */

const CAMERA_SOURCES = [
  {
    id: "youtube-curated-live",
    kind: "youtube_live",
    enabled: true,
    commercial_ok: true,
    paid: false,
    requires_key: false,
    optional_key_env: ["HAVKAR_YOUTUBE_API_KEY", "YOUTUBE_DATA_API_KEY", "YOUTUBE_API_KEY"],
    license: "YouTube embed — official player / ToS; curated public livestreams only",
    license_url: "https://www.youtube.com/static?template=terms",
    coverage: "Curated public tourism/street livestreams (IT, JP, US, FR) — probe-gated",
    countries: ["IT", "JP", "US", "FR"],
    categories: ["city", "tourism"],
    playback: "true_live_video",
    note: "Only streams confirmed LIVE are labeled verified live. UNKNOWN is never labeled LIVE."
  },
  {
    id: "singapore-lta",
    kind: "jpeg_periodic",
    enabled: true,
    commercial_ok: true,
    paid: false,
    requires_key: false,
    license: "Singapore Open Data Licence",
    license_url: "https://data.gov.sg/open-data-licence",
    coverage: "Singapore expressways / roads (LTA traffic images)",
    countries: ["SG"],
    categories: ["road", "highway"],
    playback: "periodic_jpeg"
  },
  {
    id: "digitraffic-finland",
    kind: "jpeg_periodic",
    enabled: true,
    commercial_ok: true,
    paid: false,
    requires_key: false,
    license: "Creative Commons Attribution 4.0 (Digitraffic / Fintraffic)",
    license_url: "https://www.digitraffic.fi/en/developers/",
    coverage: "Finland road weather cameras (Fintraffic Digitraffic)",
    countries: ["FI"],
    attribution: "Fintraffic Digitraffic",
    categories: ["road", "weather"],
    playback: "periodic_jpeg"
  },
  {
    id: "calgary-traffic",
    kind: "jpeg_periodic",
    enabled: true,
    commercial_ok: true,
    paid: false,
    requires_key: false,
    license: "Open Government Licence – City of Calgary",
    license_url: "https://data.calgary.ca/",
    coverage: "Calgary traffic cameras (City of Calgary open data)",
    countries: ["CA"],
    attribution: "City of Calgary",
    categories: ["road", "intersection"],
    playback: "periodic_jpeg"
  },
  {
    id: "datumfeed-commercial",
    kind: "jpeg_poll",
    enabled: true,
    commercial_ok: true,
    paid: false,
    requires_key: false,
    optional_key_env: ["DATUMFEED_API_KEY"],
    license: "Per-registry open licences with commercialOk=true only",
    license_url: "https://datumfeed.com/",
    coverage: "Austin TX, Ontario 511, TfL London JamCams, Toronto (Datumfeed index)",
    countries: ["US", "CA", "GB"],
    categories: ["road", "city"],
    playback: "polled_jpeg",
    note: "Registries with unknown commercialOk are excluded. Optional DATUMFEED_API_KEY improves quota. New sources need Owner license review — beach/port/airport cams not added without verified ToS."
  }
];

function listCameraSources() {
  return CAMERA_SOURCES.map(function (s) {
    const needs = Array.isArray(s.optional_key_env) ? s.optional_key_env : [];
    const keyConfigured = needs.some(function (name) {
      return Boolean(String(process.env[name] || "").trim());
    });
    return Object.assign({}, s, {
      optional_key_configured: needs.length ? keyConfigured : undefined,
      armed: s.enabled !== false && (s.requires_key ? keyConfigured : true)
    });
  });
}

function sourceById(id) {
  return listCameraSources().find(function (s) {
    return s.id === id;
  }) || null;
}

module.exports = {
  CAMERA_SOURCES,
  listCameraSources,
  sourceById
};
