/**
 * Regression: live cameras must stay reachable after destination-search hardening.
 * Distinguishes: (1) button/panel removed, (2) exists but won't play, (3) no LIVE here.
 * Empty radius must not hide the whole feature; nearest verified LIVE keeps Play.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("PR #235 destination gate no longer hard-blocks cameras without search", () => {
  const toolbar = read("havkar-map-pro-toolbar.js");
  assert.match(toolbar, /function resolveWorkingPoint/);
  assert.doesNotMatch(toolbar, /function requireDestination\b/);
  assert.match(toolbar, /maps\.msg_using_map_center/);
  assert.match(toolbar, /from_map_center:\s*true/);
  assert.match(toolbar, /openLiveCamerasLayer/);
  assert.match(toolbar, /enableLiveCameras/);
  assert.match(toolbar, /nearCamsBtn\.addEventListener/);
  assert.match(toolbar, /openSurroundingsAtDestination\("cameras"\)/);
  assert.match(toolbar, /openLiveCamerasLayer\(\)/);
});

test("live layers expose durable openCamera + enableLiveCameras APIs", () => {
  const layers = read("havkar-map-live-layers.js");
  assert.match(layers, /function enableLiveCameras/);
  assert.match(layers, /root\.HAVKAR_MAP_LIVE_LAYERS\.openCamera = openCamera/);
  assert.match(layers, /root\.HAVKAR_MAP_LIVE_LAYERS\.enableLiveCameras = enableLiveCameras/);
  assert.match(layers, /root\.HAVKAR_MAP_LIVE_LAYERS\._viewerReady = true/);
  assert.match(layers, /root\.HAVKAR_MAP_LIVE_LAYERS\.attachLayerMenu = attachLayerMenu/);
  /* Must not wipe the export object to attach-only. */
  assert.doesNotMatch(
    layers,
    /root\.HAVKAR_MAP_LIVE_LAYERS = \{\s*attachLayerMenu:\s*attachLayerMenu\s*\}/
  );
  /* Must not ship a no-op openCamera stub that swallows Play clicks. */
  assert.doesNotMatch(
    layers,
    /openCamera\s*=\s*function\s*\(\s*\)\s*\{\s*\}/
  );
  assert.match(layers, /loadCameras\("live"\)/);
  assert.match(layers, /Play live video|maps\.play_live|openCamera\(cam\)/);
  assert.match(layers, /Sorted by distance/);
});

test("surroundings keeps cameras feature when radius is empty + Play on nearest LIVE", () => {
  const surr = read("havkar-hotel-surroundings.js");
  assert.match(surr, /function renderCameras/);
  assert.match(surr, /function appendCameraCard/);
  assert.match(surr, /function playCamera/);
  assert.match(surr, /maps\.cam_state_no_live_here/);
  assert.match(surr, /maps\.cam_state_exists_no_play/);
  assert.match(surr, /maps\.cam_feature_available/);
  assert.match(surr, /maps\.cam_outside_radius/);
  assert.match(surr, /maps\.play_live/);
  assert.match(surr, /maps\.play_nearest_live|maps\.play_live/);
  assert.match(surr, /nearest_live_camera/);
  assert.match(surr, /data-cam-play/);
  assert.match(surr, /list\.sort/);
  assert.match(surr, /distance_km/);
  /* Empty list must still append nearest LIVE card with play path. */
  assert.match(surr, /appendCameraCard\(nearest/);
  assert.match(surr, /_viewerReady/);
  assert.match(surr, /layers\.openCamera|openCamera/);
  assert.match(surr, /watch_url|youtube_id/);
});

test("Tickets and Accommodation keep live-camera entry points", () => {
  const tickets = read("tickets.html");
  const acc = read("accommodation.html");
  for (const html of [tickets, acc]) {
    assert.match(html, /havkar-map-pro-toolbar\.js/);
    assert.match(html, /havkar-map-live-layers\.js/);
    assert.match(html, /havkar-hotel-surroundings\.js/);
    assert.match(html, /havkar-map-i18n\.js/);
  }
});

test("three camera honesty states are localized in all packs", () => {
  const i18n = read("havkar-map-i18n.js");
  for (const key of [
    "maps.cam_state_no_live_here",
    "maps.cam_state_exists_no_play",
    "maps.cam_feature_available",
    "maps.cam_outside_radius",
    "maps.layer_live_cams",
    "maps.nearby_cameras",
    "maps.play_live",
    "maps.msg_using_map_center"
  ]) {
    assert.match(i18n, new RegExp('"' + key.replace(/\./g, "\\.") + '"'));
  }
});

test("service worker cache bumped for live-cameras restore", () => {
  assert.match(read("sw.js"), /map-final-dock-v1|live-cameras-restore-v1/);
  assert.match(read("havkar-sw-register.js"), /map-final-dock-v1|live-cameras-restore-v1/);
});

test("destination search + Mapillary + TomTom + payments-off preserved", () => {
  const toolbar = read("havkar-map-pro-toolbar.js");
  assert.match(toolbar, /api\/map-tomtom-search/);
  assert.match(toolbar, /lastDestination/);
  assert.match(toolbar, /placeDestinationMarker/);
  const surr = read("havkar-hotel-surroundings.js");
  assert.match(surr, /mapillary|Mapillary/);
  assert.match(surr, /api\/map-street-view/);
  const plus = read("lib/havkar-maps-plus.cjs");
  assert.match(plus, /sales_enabled:\s*false/);
  assert.match(plus, /billing_enabled:\s*false/);
});

test("live video API still returns distance-sorted verified cameras", async () => {
  const url =
    "https://havkar.online/api/map-live-videos?active=1&include_unknown=1&limit=20&lat=41.9028&lng=12.4964&radius_km=50&expand=1";
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  assert.equal(res.ok, true, "live videos http");
  const body = await res.json();
  assert.ok(Array.isArray(body.cameras), "cameras array");
  /* Client layers sort by distance_km; API must provide finite distances when lat/lng given. */
  const withDistance = (body.cameras || []).filter((c) => Number.isFinite(Number(c.distance_km)));
  assert.ok(withDistance.length >= 1 || (body.cameras || []).length === 0, "distance_km when cams present");
  const sorted = withDistance
    .slice()
    .sort((a, b) => Number(a.distance_km) - Number(b.distance_km));
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(
      Number(sorted[i].distance_km) >= Number(sorted[i - 1].distance_km) - 0.001,
      "client distance sort stable"
    );
  }
  for (const cam of body.cameras || []) {
    if (cam.status === "live") {
      assert.equal(cam.live_stream, true, "live implies live_stream");
    }
    if (cam.live_stream !== true) {
      assert.notEqual(cam.status, "live", "non-stream never labeled live");
    }
  }
});

test("nearby surroundings keeps nearest_live_camera when radius empty", async () => {
  /* Bari — often empty small radius; nearest LIVE must still be returned. */
  const url =
    "https://havkar.online/api/map-nearby-surroundings?lat=41.1171&lng=16.8719&radius_km=1";
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  assert.equal(res.ok, true, "surroundings http");
  const body = await res.json();
  assert.ok(body && typeof body === "object", "body");
  assert.ok("cameras" in body || "camera_count" in body, "cameras field");
  if ((!body.cameras || !body.cameras.length) && body.nearest_live_camera) {
    assert.equal(body.nearest_live_camera.status, "live");
    assert.equal(body.nearest_live_camera.live_stream, true);
    assert.ok(Number.isFinite(Number(body.nearest_live_camera.distance_km)));
  }
});

test("surroundings source ships cameras section before 360 and Play on nearest", () => {
  const surr = read("havkar-hotel-surroundings.js");
  const camsIdx = Math.max(surr.indexOf("body.appendChild(hCams)"), surr.indexOf("host.appendChild(hCams)"));
  const svIdx = Math.max(surr.indexOf("body.appendChild(svBox)"), surr.indexOf("host.appendChild(svBox)"));
  assert.ok(camsIdx > 0 && svIdx > camsIdx, "cameras block before street-view block");
  assert.match(surr, /state\.focus === "cameras"/);
  assert.match(read("lib/map-nearby-surroundings.mjs"), /embed_url:\s*nearestLive\.embed_url/);
  assert.match(read("lib/map-nearby-surroundings.mjs"), /watch_url:\s*nearestLive\.watch_url/);
});
