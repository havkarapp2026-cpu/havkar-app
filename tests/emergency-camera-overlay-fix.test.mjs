import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("camera viewer must not use always-on display:flex that overrides hidden", () => {
  const src = read("havkar-map-live-layers.js");
  assert.match(src, /closeCameraViewer/);
  assert.match(src, /openCameraViewerShell/);
  assert.match(src, /display:none/);
  assert.match(src, /pointer-events:none/);
  assert.match(src, /never leave display:flex while "closed"/);
  /* Closed state must set display none; open state may set flex. */
  assert.match(src, /viewer\.style\.display = "none"/);
  assert.match(src, /viewer\.style\.display = "flex"/);
  /* Initial cssText must not lock the page with display:flex alone. */
  assert.doesNotMatch(
    src,
    /havkar-camera-viewer[\s\S]{0,400}cssText\s*=\s*[^;]*display:flex/
  );
});

test("service worker bumped for emergency overlay fix", () => {
  const sw = read("sw.js");
  const reg = read("havkar-sw-register.js");
  assert.match(sw, /live-cameras-restore-v1|emergency-camera-overlay-fix-v1|havkar-sw-20261118/);
  assert.match(reg, /live-cameras-restore-v1|emergency-camera-overlay-fix-v1|havkar-sw-20261118/);
});
