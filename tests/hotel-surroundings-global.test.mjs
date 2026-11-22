import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("hotel surroundings UI wires Accommodation listings", () => {
  assert.equal(fs.existsSync(path.join(root, "havkar-hotel-surroundings.js")), true);
  assert.equal(fs.existsSync(path.join(root, "havkar-hotel-surroundings.css")), true);
  const hotels = read("accommodation.html");
  assert.match(hotels, /havkar-hotel-surroundings\.js/);
  assert.match(hotels, /HAVKAR_HOTEL_SURROUNDINGS/);
  assert.match(hotels, /View surroundings|attachListingButton/);
  assert.match(read("havkar-hotel-surroundings.js"), /maps\.view_surroundings|View surroundings/);
  assert.match(read("havkar-hotel-surroundings.js"), /map-nearby-surroundings/);
  assert.match(read("havkar-hotel-surroundings.js"), /street_view|map-street-view/);
  assert.match(read("havkar-hotel-surroundings.js"), /mapillary/);
  assert.match(read("havkar-hotel-surroundings.js"), /google_maps_embed|gembed|Google Maps Embed/);
  assert.doesNotMatch(
    read("havkar-hotel-surroundings.js"),
    /showFakePanorama|invented panorama|synthetic.?street.?view/i
  );
});

test("nearby surroundings + street view APIs are routed without new serverless files", () => {
  const vercel = read("vercel.json");
  assert.match(vercel, /map-nearby-surroundings/);
  assert.match(vercel, /map-street-view/);
  assert.match(read("api/create-event-checkout.js"), /nearby_surroundings/);
  assert.match(read("api/create-event-checkout.js"), /street_view/);
  assert.equal(fs.existsSync(path.join(root, "api/map-nearby-surroundings.js")), false);
  assert.equal(fs.existsSync(path.join(root, "api/map-street-view.js")), false);
});

test("street view handler stays honest without keys and names required secrets", async () => {
  const prevM = process.env.HAVKAR_MAPILLARY_ACCESS_TOKEN;
  const prevM2 = process.env.MAPILLARY_ACCESS_TOKEN;
  const prevG = process.env.HAVKAR_GOOGLE_MAPS_EMBED_API_KEY;
  const prevG2 = process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.HAVKAR_MAPILLARY_ACCESS_TOKEN;
  delete process.env.MAPILLARY_ACCESS_TOKEN;
  delete process.env.HAVKAR_GOOGLE_MAPS_EMBED_API_KEY;
  delete process.env.GOOGLE_MAPS_EMBED_API_KEY;
  delete process.env.HAVKAR_GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  try {
    const { default: handler } = await import("../lib/map-street-view.mjs?" + Date.now());
    const out = { statusCode: 0, body: null };
    const res = {
      setHeader() {},
      status(code) {
        out.statusCode = code;
        return this;
      },
      json(body) {
        out.body = body;
      }
    };
    await handler({ method: "GET", query: { lat: "41.9028", lng: "12.4964" } }, res);
    assert.equal(out.statusCode, 200);
    assert.equal(out.body.ok, true);
    assert.equal(out.body.interactive_360, false);
    assert.equal(out.body.available, false);
    assert.equal(out.body.failure_kind, "missing_key");
    assert.match(String(out.body.user_message || out.body.reason || ""), /not configured|unavailable|satellite/i);
    assert.doesNotMatch(String(out.body.user_message || ""), /HAVKAR_MAPILLARY|GOOGLE_MAPS_EMBED/);
    assert.equal(out.body.required_secrets, undefined);
    const outDbg = { statusCode: 0, body: null };
    const resDbg = {
      setHeader() {},
      status(code) {
        outDbg.statusCode = code;
        return this;
      },
      json(body) {
        outDbg.body = body;
      }
    };
    await handler({ method: "GET", query: { lat: "41.9028", lng: "12.4964", debug: "1" } }, resDbg);
    assert.ok(Array.isArray(outDbg.body.required_secrets));
    assert.ok(
      outDbg.body.required_secrets.some(function (s) {
        return s.name === "HAVKAR_MAPILLARY_ACCESS_TOKEN";
      })
    );
    assert.ok(
      outDbg.body.required_secrets.some(function (s) {
        return s.name === "HAVKAR_GOOGLE_MAPS_EMBED_API_KEY";
      })
    );
    const mly = outDbg.body.required_secrets.find(function (s) {
      return s.name === "HAVKAR_MAPILLARY_ACCESS_TOKEN";
    });
    assert.equal(mly.payment_account_required, false);
    const g = outDbg.body.required_secrets.find(function (s) {
      return s.name === "HAVKAR_GOOGLE_MAPS_EMBED_API_KEY";
    });
    assert.equal(g.payment_account_required, true);
  } finally {
    if (prevM != null) process.env.HAVKAR_MAPILLARY_ACCESS_TOKEN = prevM;
    if (prevM2 != null) process.env.MAPILLARY_ACCESS_TOKEN = prevM2;
    if (prevG != null) process.env.HAVKAR_GOOGLE_MAPS_EMBED_API_KEY = prevG;
    if (prevG2 != null) process.env.GOOGLE_MAPS_API_KEY = prevG2;
  }
});

test("street view Mapillary path uses official graph + viewer when token set", async () => {
  const prev = process.env.HAVKAR_MAPILLARY_ACCESS_TOKEN;
  process.env.HAVKAR_MAPILLARY_ACCESS_TOKEN = "test-client-token";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function (url) {
    const u = String(url);
    if (u.includes("graph.mapillary.com/images")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            data: [
              {
                id: "111",
                geometry: { type: "Point", coordinates: [12.4965, 41.9029] },
                captured_at: 1700000000000,
                compass_angle: 90,
                is_pano: true,
                sequence: { id: "seq1" },
                thumb_1024_url: "https://example.com/t1024.jpg",
                thumb_2048_url: "https://example.com/t2048.jpg",
                camera_type: "equirectangular"
              }
            ]
          };
        }
      };
    }
    return originalFetch.apply(this, arguments);
  };
  try {
    const { default: handler } = await import("../lib/map-street-view.mjs?" + Date.now() + "mly");
    const out = { statusCode: 0, body: null };
    const res = {
      setHeader() {},
      status(code) {
        out.statusCode = code;
        return this;
      },
      json(body) {
        out.body = body;
      }
    };
    await handler(
      { method: "GET", query: { lat: "41.9028", lng: "12.4964", radius_m: "50" } },
      res
    );
    assert.equal(out.statusCode, 200);
    assert.equal(out.body.interactive_360, true);
    assert.equal(out.body.provider, "mapillary");
    assert.equal(out.body.rotate, true);
    assert.equal(out.body.move_between_points, true);
    assert.equal(out.body.viewer.type, "mapillary_js");
    assert.equal(out.body.initial_image_id, "111");
    assert.equal(out.body.client_token, "test-client-token");
    assert.ok(out.body.images.length >= 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (prev != null) process.env.HAVKAR_MAPILLARY_ACCESS_TOKEN = prev;
    else delete process.env.HAVKAR_MAPILLARY_ACCESS_TOKEN;
  }
});

test("street view Google Embed path builds free embed URL when key set and Mapillary empty", async () => {
  const prevM = process.env.HAVKAR_MAPILLARY_ACCESS_TOKEN;
  const prevG = process.env.HAVKAR_GOOGLE_MAPS_EMBED_API_KEY;
  delete process.env.HAVKAR_MAPILLARY_ACCESS_TOKEN;
  delete process.env.MAPILLARY_ACCESS_TOKEN;
  process.env.HAVKAR_GOOGLE_MAPS_EMBED_API_KEY = "embed-test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function () {
    return {
      ok: true,
      status: 200,
      async json() {
        return { data: [] };
      }
    };
  };
  try {
    const { default: handler } = await import("../lib/map-street-view.mjs?" + Date.now() + "g");
    const out = { statusCode: 0, body: null };
    const res = {
      setHeader() {},
      status(code) {
        out.statusCode = code;
        return this;
      },
      json(body) {
        out.body = body;
      }
    };
    await handler(
      { method: "GET", query: { lat: "48.8584", lng: "2.2945", provider: "google" } },
      res
    );
    assert.equal(out.body.provider, "google_maps_embed_streetview");
    assert.equal(out.body.interactive_360, true);
    assert.match(out.body.embed_url, /maps\/embed\/v1\/streetview/);
    assert.match(out.body.embed_url, /key=embed-test-key/);
    assert.match(out.body.embed_url, /location=48\.8584%2C2\.2945|location=48\.8584,2\.2945/);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevM != null) process.env.HAVKAR_MAPILLARY_ACCESS_TOKEN = prevM;
    if (prevG != null) process.env.HAVKAR_GOOGLE_MAPS_EMBED_API_KEY = prevG;
    else delete process.env.HAVKAR_GOOGLE_MAPS_EMBED_API_KEY;
  }
});

test("live videos support location radius search and distance fields", async () => {
  const { default: handler } = await import("../lib/map-live-videos.mjs");
  const out = { statusCode: 0, body: null };
  const res = {
    setHeader() {},
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(body) {
      out.body = body;
    }
  };
  await handler(
    {
      method: "GET",
      query: { lat: "41.9", lng: "12.5", radius_km: "50", limit: "10" }
    },
    res
  );
  assert.equal(out.statusCode, 200);
  assert.equal(out.body.ok, true);
  assert.ok(
    out.body.search &&
      (out.body.search.mode === "location_radius" ||
        out.body.search.mode === "nearest_active_global")
  );
  assert.ok(Array.isArray(out.body.cameras));
  assert.ok(out.body.cameras.every(function (c) {
    return c.youtube_id || c.id;
  }));
});

test("hotels_search maps listing coordinates fields", () => {
  const api = read("api/create-event-checkout.js");
  assert.match(api, /accommodation_addresses/);
  assert.match(api, /latitude:/);
  assert.match(api, /address_line/);
  assert.match(read("lib/duffel-stays.cjs"), /geographic_coordinates/);
});

test("pro toolbar autocomplete + nearby tools stay free; Maps Plus sales OFF; 15 tiles", () => {
  const toolbar = read("havkar-map-pro-toolbar.js");
  assert.match(toolbar, /typeahead=true/);
  assert.match(toolbar, /near-cams/);
  assert.match(toolbar, /street-view/);
  assert.match(toolbar, /maps\.view_surroundings|View surroundings/);
  assert.match(toolbar, /radius_m=50/);
  assert.match(read("lib/havkar-maps-plus.cjs"), /sales_enabled:\s*false/);
  assert.equal((read("index.html").match(/class="tile-label"/g) || []).length, 15);
  assert.match(read("sw.js"), /map-final-dock-v1|live-cameras-restore-v1|map-search-destination-v1|map-i18n-complete-v1|map-surroundings-bari-v1|smart-travel-health-v1|hotel-streetview-mapillary-v1/);
});

test("nearby surroundings handler returns structured payload for Rome", async () => {
  const { default: handler } = await import("../lib/map-nearby-surroundings.mjs");
  const out = { statusCode: 0, body: null };
  const res = {
    setHeader() {},
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(body) {
      out.body = body;
    }
  };
  await handler(
    { method: "GET", query: { lat: "41.9028", lng: "12.4964", radius_km: "25" } },
    res
  );
  assert.equal(out.statusCode, 200);
  assert.equal(out.body.ok, true);
  assert.equal(out.body.free_for_users, true);
  assert.ok(Array.isArray(out.body.cameras));
  assert.ok(Array.isArray(out.body.photos));
  assert.ok(out.body.street_view);
  assert.ok(out.body.pois);
  assert.equal(typeof out.body.camera_count, "number");
  assert.ok(out.body.diagnosis);
  assert.match(String(out.body.coverage && out.body.coverage.street_view), /Mapillary|GOOGLE|Embed/i);
  assert.match(String(out.body.coverage && out.body.coverage.pois), /TomTom/i);
  assert.doesNotMatch(String(out.body.user_message || out.body.message || ""), /HAVKAR_MAPILLARY|GOOGLE_MAPS_EMBED/);
});
