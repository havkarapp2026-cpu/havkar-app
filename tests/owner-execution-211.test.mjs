import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

test("iOS release config bumped and privacy strings present", () => {
  const plist = fs.readFileSync(path.join(root, "ios/HAVKAR/Info.plist"), "utf8");
  assert.match(plist, /NSCameraUsageDescription/);
  assert.match(plist, /NSLocationWhenInUseUsageDescription/);
  assert.match(plist, /NSPhotoLibraryUsageDescription/);
  assert.match(plist, /NSMicrophoneUsageDescription/);
  const pbx = fs.readFileSync(path.join(root, "ios/HAVKAR.xcodeproj/project.pbxproj"), "utf8");
  assert.match(pbx, /MARKETING_VERSION = 1\.0\.4/);
  assert.match(pbx, /CURRENT_PROJECT_VERSION = 4/);
  const privacy = fs.readFileSync(path.join(root, "ios/HAVKAR/PrivacyInfo.xcprivacy"), "utf8");
  assert.match(privacy, /NSPrivacyAccessedAPICategoryUserDefaults/);
  assert.match(privacy, /NSPrivacyTracking<\/key>\s*<false\/>/);
});

test("Android release config bumped with full mipmap set", () => {
  const gradle = fs.readFileSync(path.join(root, "android/app/build.gradle.kts"), "utf8");
  assert.match(gradle, /versionCode = 4/);
  assert.match(gradle, /versionName = "1\.0\.4"/);
  assert.match(gradle, /applicationId = "online\.havkar\.app"/);
  for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
    assert.ok(
      fs.existsSync(path.join(root, `android/app/src/main/res/mipmap-${d}/ic_launcher.png`))
    );
  }
  const manifest = fs.readFileSync(
    path.join(root, "android/app/src/main/AndroidManifest.xml"),
    "utf8"
  );
  assert.match(manifest, /RECORD_AUDIO/);
  assert.match(manifest, /CAMERA/);
  assert.match(manifest, /ACCESS_FINE_LOCATION/);
});

test("telehealth documents exact TURN secret names and stays gated", () => {
  const { telehealthStatus } = require("../lib/telehealth-adapter.cjs");
  const status = telehealthStatus({});
  assert.equal(status.voice, "BLOCKED");
  assert.equal(status.video, "BLOCKED");
  assert.deepEqual(status.external_secrets_required, [
    "HAVKAR_TURN_URL",
    "HAVKAR_TURN_USERNAME",
    "HAVKAR_TURN_CREDENTIAL"
  ]);
});

test("omio still refuses inventing affiliate tracking from Impact catalog ids", () => {
  const { omioConfigured } = require("../lib/omio-adapter.cjs");
  const status = omioConfigured({});
  assert.equal(status.impact_partner_program.advertiser_id, "463493");
  assert.equal(status.affiliate_search_ready, false);
  assert.match(status.external_actions_required.join(" "), /OMIO_AFFILIATE_ID/);
});

test("partita IVA remains unpublished without Visura", () => {
  const op = fs.readFileSync(path.join(root, "havkar-operator-config.js"), "utf8");
  assert.match(op, /partitaIva:\s*""/);
  assert.doesNotMatch(op, /04086440791/);
});

test("global release preflight script passes without printing secrets", () => {
  const script = path.join(root, "scripts/global-release-preflight.sh");
  assert.ok(fs.existsSync(script));
  const run = spawnSync("bash", [script], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /RESULT: global release preflight PASS/);
  assert.doesNotMatch(run.stdout, /BEGIN PRIVATE KEY|-----BEGIN/);
});

test("Play Data Safety draft matches current version and permissions", () => {
  const doc = fs.readFileSync(path.join(root, "store/PLAY_DATA_SAFETY.md"), "utf8");
  assert.match(doc, /`4` \/ `1\.0\.4`/);
  assert.match(doc, /CAMERA/);
  assert.match(doc, /ACCESS_FINE_LOCATION/);
});
