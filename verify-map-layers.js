#!/usr/bin/env node
/**
 * Smoke verification for map rain / cameras / traffic layers.
 * Run: node verify-map-layers.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
let failed = 0;

function ok(label, cond, detail) {
  if (cond) {
    console.log("PASS", label, detail || "");
  } else {
    failed += 1;
    console.error("FAIL", label, detail || "");
  }
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function mainStatic() {
  const tickets = read("tickets.html");
  const acc = read("accommodation.html");
  const layers = read("havkar-map-live-layers.js");
  const sw = read("sw.js");

  ok("tickets loads live-layers script", tickets.includes("havkar-map-live-layers.js"));
  ok("tickets has layer menu host", tickets.includes("ticketsLayerMenuHost"));
  ok("tickets does not keep old 4-button data-tickets-layer", !tickets.includes("data-tickets-layer"));
  ok("accommodation loads live-layers script", acc.includes("havkar-map-live-layers.js"));
  ok("accommodation has layer menu host", acc.includes("accLayerMenuHost"));
  ok("accommodation does not keep data-acc-layer buttons", !acc.includes("data-acc-layer"));

  [
    "Street map",
    "Satellite",
    "Hybrid",
    "Live map",
    "Rain radar",
    "Live cameras",
    "Intersection cameras",
    "Traffic status"
  ].forEach(function (label) {
    ok("menu includes " + label, layers.includes(label));
  });

  ok("rain play control", layers.includes('data-rain="play"'));
  ok("rain pause control", layers.includes('data-rain="pause"'));
  ok("rain scrub control", layers.includes('data-rain="scrub"'));
  ok("camera country filter", layers.includes('data-cam="country"'));
  ok("never accepts arbitrary stream injection", layers.includes("allowlisted API only"));
  ok("SW bumped for map layers", sw.includes("map-layers-rain-cameras-traffic-v1"));

  ok("lib rain exists", fs.existsSync(path.join(ROOT, "lib/map-rain-radar.mjs")));
  ok("lib cameras exists", fs.existsSync(path.join(ROOT, "lib/map-public-cameras.mjs")));
  ok("lib traffic exists", fs.existsSync(path.join(ROOT, "lib/map-traffic.mjs")));
  ok("no extra Hobby functions for map APIs", !fs.existsSync(path.join(ROOT, "api/map-rain-radar.js")));

  const cams = read("lib/map-public-cameras.mjs");
  ok("cameras reject client stream URLs", cams.includes("Never accepts client-supplied stream URLs"));
  ok("cameras require commercialOk", cams.includes("commercialOk !== true"));
  ok("Caltrans excluded note", cams.includes("Caltrans"));

  const traffic = read("lib/map-traffic.mjs");
  ok("traffic key stays server-side", traffic.includes("never returned to the browser"));
  ok("traffic gates without key", traffic.includes("TOMTOM_API_KEY"));

  const vercel = read("vercel.json");
  ok("vercel rewrite rain", vercel.includes("mapRainRadar"));
  ok("vercel rewrite cameras", vercel.includes("mapPublicCameras"));
  ok("vercel rewrite traffic", vercel.includes("mapTraffic"));
}

async function mainLive() {
  const rainRes = await fetch("https://api.rainviewer.com/public/weather-maps.json", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000)
  });
  ok("RainViewer upstream reachable", rainRes.ok, "status=" + rainRes.status);
  if (rainRes.ok) {
    const body = await rainRes.json();
    const past = body && body.radar && body.radar.past;
    ok("RainViewer has past frames", Array.isArray(past) && past.length > 0, "frames=" + (past && past.length));
  }

  const sgRes = await fetch("https://api.data.gov.sg/v1/transport/traffic-images", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000)
  });
  ok("Singapore LTA upstream reachable", sgRes.ok, "status=" + sgRes.status);
  if (sgRes.ok) {
    const body = await sgRes.json();
    const cams =
      body &&
      Array.isArray(body.items) &&
      body.items[0] &&
      Array.isArray(body.items[0].cameras)
        ? body.items[0].cameras
        : [];
    ok("Singapore LTA returns cameras", cams.length > 0, "count=" + cams.length);
    if (cams[0] && cams[0].image) {
      ok(
        "Singapore image host allowlisted",
        String(cams[0].image).startsWith("https://images.data.gov.sg/")
      );
    }
  }

  /* Exercise handler logic for Singapore bbox without Vercel. */
  const { default: camerasHandler } = await import("./lib/map-public-cameras.mjs");
  const { default: rainHandler } = await import("./lib/map-rain-radar.mjs");
  const { default: trafficHandler } = await import("./lib/map-traffic.mjs");

  function mockRes() {
    const out = { statusCode: 0, body: null, headers: {} };
    return {
      out: out,
      setHeader: function (k, v) {
        out.headers[k] = v;
      },
      status: function (code) {
        out.statusCode = code;
        return this;
      },
      json: function (body) {
        out.body = body;
        return this;
      },
      send: function (buf) {
        out.body = buf;
        return this;
      }
    };
  }

  const rainMock = mockRes();
  await rainHandler({ method: "GET", query: {} }, rainMock);
  ok("map-rain-radar handler ok", rainMock.out.statusCode === 200 && rainMock.out.body && rainMock.out.body.ok);
  ok(
    "map-rain-radar frames",
    rainMock.out.body && rainMock.out.body.available && rainMock.out.body.frames && rainMock.out.body.frames.length > 0,
    "frames=" + (rainMock.out.body && rainMock.out.body.frames && rainMock.out.body.frames.length)
  );
  ok("map-rain-radar legend", rainMock.out.body && Array.isArray(rainMock.out.body.legend));

  const sgBbox = "103.6,1.2,104.1,1.5";
  const camMock = mockRes();
  await camerasHandler(
    { method: "GET", query: { bbox: sgBbox, kind: "intersection", limit: "20" } },
    camMock
  );
  ok("map-public-cameras handler ok", camMock.out.statusCode === 200 && camMock.out.body && camMock.out.body.ok);
  ok(
    "map-public-cameras Singapore results",
    camMock.out.body && camMock.out.body.count > 0,
    "count=" + (camMock.out.body && camMock.out.body.count)
  );

  const emptyMock = mockRes();
  await camerasHandler(
    { method: "GET", query: { bbox: "10,10,11,11", kind: "all", limit: "10" } },
    emptyMock
  );
  ok(
    "map-public-cameras empty area message",
    emptyMock.out.body && emptyMock.out.body.available === false
  );

  const trafficMock = mockRes();
  await trafficHandler({ method: "GET", query: {} }, trafficMock);
  ok("map-traffic handler responds", trafficMock.out.statusCode === 200 && trafficMock.out.body && trafficMock.out.body.ok);
  const hasKey = Boolean(String(process.env.TOMTOM_API_KEY || "").trim());
  ok(
    "map-traffic honest gate without invented tiles",
    hasKey
      ? trafficMock.out.body.available === true
      : trafficMock.out.body.available === false &&
          String(trafficMock.out.body.message || "").includes("TOMTOM_API_KEY")
  );
}

(async function () {
  mainStatic();
  try {
    await mainLive();
  } catch (err) {
    failed += 1;
    console.error("FAIL live checks", err && err.message ? err.message : err);
  }
  console.log(failed ? "RESULT FAIL count=" + failed : "RESULT PASS");
  process.exit(failed ? 1 : 0);
})();
