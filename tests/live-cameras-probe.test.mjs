import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("youtube live probe rejects ended recordings and VOD", () => {
  const { classifyFromSignals } = require("../lib/youtube-live-probe.cjs");
  assert.equal(
    classifyFromSignals({
      playStatus: "UNPLAYABLE",
      reason: "This live stream recording is not available.",
      isLiveContent: true,
      isLive: false
    }).live,
    false
  );
  assert.equal(
    classifyFromSignals({
      playStatus: "OK",
      isLive: false,
      isLiveContent: false,
      lengthSeconds: "213"
    }).status,
    "vod"
  );
  assert.equal(
    classifyFromSignals({
      playStatus: "OK",
      isLiveNow: true,
      isLive: true
    }).live,
    true
  );
  assert.equal(
    classifyFromSignals({
      liveBroadcastDetails: { isLiveNow: false, endTimestamp: "2025-05-11T06:43:30+00:00" },
      isLiveContent: true
    }).status,
    "ended"
  );
});

test("live videos API always probes and excludes non-live by default", async () => {
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
      return this;
    }
  };
  await handler(
    {
      method: "GET",
      query: { lat: "41.9", lng: "12.5", radius_km: "30", active: "1", expand: "1", limit: "20" }
    },
    res
  );
  assert.equal(out.statusCode, 200);
  assert.equal(out.body.ok, true);
  assert.ok(Array.isArray(out.body.cameras));
  assert.ok(
    out.body.cameras.every(function (c) {
      return c.live_stream === true && c.status === "live" && c.embed_url;
    })
  );
  /* Ended Rome recording must not appear as live */
  assert.ok(
    out.body.cameras.every(function (c) {
      return c.youtube_id !== "0ovLESyVR-g";
    })
  );
});

test("validate endpoint returns alternatives when camera is dead", async () => {
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
      return this;
    }
  };
  await handler(
    {
      method: "GET",
      query: {
        validate: "0ovLESyVR-g",
        lat: "41.9",
        lng: "12.5",
        radius_km: "20000"
      }
    },
    res
  );
  assert.equal(out.statusCode, 200);
  assert.equal(out.body.live, false);
  assert.ok(Array.isArray(out.body.alternatives));
});

test("UI re-validates before playback and never labels recordings as live", () => {
  const layers = read("havkar-map-live-layers.js");
  assert.match(layers, /Checking live status before playback/);
  assert.match(layers, /validate=/);
  assert.match(layers, /Play nearest live camera/);
  assert.match(layers, /active=1/);
  assert.match(layers, /LIVE video \(verified\)/);
  assert.doesNotMatch(layers, /curated public webcam"\);/);
  assert.match(read("sw.js"), /live-cameras-probe-v1/);
});
