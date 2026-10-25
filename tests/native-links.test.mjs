import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

const kotlin = read("android/app/src/main/java/online/havkar/app/HavkarLinks.kt");
const swift = read("ios/HAVKAR/HavkarLinks.swift");
const manifest = read("android/app/src/main/AndroidManifest.xml");
const gradle = read("android/app/build.gradle.kts");

for (const source of [kotlin, swift]) {
  assert.match(source, /havkar-app\.vercel\.app/);
  assert.match(source, /accounts\.google\.com/);
  assert.match(source, /\.supabase\.co/);
  assert.match(source, /\.havkar\.online/);
}

assert.match(gradle, /applicationId = "online\.havkar\.app"/);
assert.equal(manifest.includes("autoVerify"), false);
assert.equal(manifest.includes("*.vercel.app"), false);
assert.match(read("ios/HAVKAR.xcodeproj/project.pbxproj"), /PRODUCT_BUNDLE_IDENTIFIER = online\.havkar\.app;/);
assert.match(read("ios/HAVKAR/PrivacyInfo.xcprivacy"), /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
assert.equal(fs.existsSync(path.join(root, "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png")), true);
assert.equal(fs.existsSync(path.join(root, "ios/HAVKAR/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png")), true);

console.log("NATIVE_LINKS_TEST_OK");
