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

test("bot-check / LOGIN_REQUIRED is UNKNOWN not offline and never live", () => {
  const { classifyFromSignals, isBotCheckSignal } = require("../lib/youtube-live-probe.cjs");
  assert.equal(
    isBotCheckSignal({ playStatus: "LOGIN_REQUIRED", reason: "" }),
    true
  );
  const bot = classifyFromSignals({
    playStatus: "LOGIN_REQUIRED",
    reason: "Sign in to confirm you’re not a bot",
    isLive: false,
    isLiveNow: false
  });
  assert.equal(bot.live, false);
  assert.equal(bot.status, "unknown");
  assert.equal(bot.availability, "unknown");
  assert.equal(bot.reason, "bot_check_or_login_required");
  /* Confirmed live wins even if playStatus was LOGIN_REQUIRED */
  const liveThroughWall = classifyFromSignals({
    playStatus: "LOGIN_REQUIRED",
    isLiveNow: true,
    isLive: true
  });
  assert.equal(liveThroughWall.live, true);
  assert.equal(liveThroughWall.availability, "live");
});

test("camera source registry lists licensed manageable sources", () => {
  const { listCameraSources } = require("../lib/map-camera-sources.cjs");
  const sources = listCameraSources();
  const ids = sources.map((s) => s.id);
  assert.ok(ids.includes("youtube-curated-live"));
  assert.ok(ids.includes("singapore-lta"));
  assert.ok(ids.includes("digitraffic-finland"));
  assert.ok(ids.includes("calgary-traffic"));
  assert.ok(ids.includes("datumfeed-commercial"));
  assert.ok(sources.every((s) => s.commercial_ok === true));
});

test("live videos API only labels confirmed live as LIVE; UNKNOWN never live_stream", async () => {
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
      query: {
        lat: "41.9",
        lng: "12.5",
        radius_km: "30",
        active: "1",
        include_unknown: "1",
        expand: "1",
        limit: "20"
      }
    },
    res
  );
  assert.equal(out.statusCode, 200);
  assert.equal(out.body.ok, true);
  assert.ok(Array.isArray(out.body.cameras));
  assert.ok(
    out.body.cameras.every(function (c) {
      if (c.live_stream === true) {
        return c.status === "live" && c.embed_url && c.availability === "live";
      }
      if (c.availability === "unknown") {
        return c.live_stream === false && !c.embed_url && /^https:\/\//.test(c.watch_url);
      }
      return false;
    })
  );
  /* Ended Rome recording must not appear as live */
  assert.ok(
    out.body.cameras.every(function (c) {
      return !(c.youtube_id === "0ovLESyVR-g" && c.live_stream === true);
    })
  );
});

test("validate endpoint returns alternatives and keeps official watch on dead cam", async () => {
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
  assert.ok(out.body.camera && /^https:\/\/www\.youtube\.com\//.test(out.body.camera.watch_url));
});

test("public cameras include Digitraffic Finland and Calgary for matching bboxes", async () => {
  const { default: handler } = await import("../lib/map-public-cameras.mjs");
  async function run(query) {
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
    await handler({ method: "GET", query: query }, res);
    return out;
  }
  const fi = await run({
    bbox: "24.5,60.0,25.2,60.4",
    kind: "intersection",
    limit: "20"
  });
  assert.equal(fi.statusCode, 200);
  assert.ok(fi.body.count > 0);
  assert.ok(fi.body.cameras.every((c) => c.commercial_ok === true));
  assert.ok(fi.body.cameras.some((c) => c.source === "digitraffic-finland"));
  assert.ok(
    fi.body.cameras.every((c) => /^https:\/\/weathercam\.digitraffic\.fi\//.test(c.image_url))
  );

  const yy = await run({
    bbox: "-114.2,50.9,-113.9,51.15",
    kind: "all",
    limit: "20"
  });
  assert.equal(yy.statusCode, 200);
  assert.ok(yy.body.count > 0);
  assert.ok(yy.body.cameras.some((c) => c.source === "calgary-traffic"));
  assert.ok(
    yy.body.cameras
      .filter((c) => c.source === "calgary-traffic")
      .every((c) => /^https:\/\/trafficcam\.calgary\.ca\//.test(c.image_url))
  );
});

test("UI distinguishes LIVE / UNKNOWN / OFFLINE and re-validates before playback", () => {
  const layers = read("havkar-map-live-layers.js");
  assert.match(layers, /Checking live status before playback/);
  assert.match(layers, /validate=/);
  assert.match(layers, /Play nearest live camera/);
  assert.match(layers, /include_unknown=1/);
  assert.match(layers, /LIVE video \(verified\)/);
  assert.match(layers, /\[UNKNOWN\]/);
  assert.match(layers, /Status UNKNOWN/);
  assert.doesNotMatch(layers, /curated public webcam"\);/);
  assert.match(read("sw.js"), /live-cameras-global-v1/);
  assert.match(read("lib/map-camera-sources.cjs"), /digitraffic-finland/);
});
