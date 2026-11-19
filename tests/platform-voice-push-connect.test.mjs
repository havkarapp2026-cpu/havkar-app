import assert from "node:assert/strict";
import fs from "node:fs";

const sw = fs.readFileSync("sw.js", "utf8");
assert.match(sw, /\/assets\/icons\/havkar-icon-192-20261022-v3\.png/);
assert.doesNotMatch(sw, /\/icons\/icon-192\.png/);

const vercel = fs.readFileSync("vercel.json", "utf8");
assert.match(vercel, /camera=\(\), microphone=\(\)/);
assert.match(vercel, /havkar-ai\.html[\s\S]*microphone=\(self\)/);
assert.match(vercel, /notifications\|verification-review\|finance\|post-ad\|search\|saved\|privacy\|terms\|alerts/);

const about = fs.readFileSync("about.html", "utf8");
assert.match(about, /https:\/\/havkar\.online\//);
assert.doesNotMatch(about, /href="https:\/\/havkar-app\.vercel\.app\/"/);

const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
assert.match(manifest, /android\.permission\.RECORD_AUDIO/);

const main = fs.readFileSync(
  "android/app/src/main/java/online/havkar/app/MainActivity.kt",
  "utf8"
);
assert.match(main, /onPermissionRequest/);
assert.match(main, /RESOURCE_AUDIO_CAPTURE/);
assert.match(main, /HAVKAR-Android\/1\.0\.3/);

const gradle = fs.readFileSync("android/app/build.gradle.kts", "utf8");
assert.match(gradle, /versionName = "1\.0\.4"/);

const plist = fs.readFileSync("ios/HAVKAR/Info.plist", "utf8");
assert.match(plist, /NSMicrophoneUsageDescription/);

const pbx = fs.readFileSync("ios/HAVKAR.xcodeproj/project.pbxproj", "utf8");
assert.match(pbx, /MARKETING_VERSION = 1\.0\.4;/);
assert.match(pbx, /CURRENT_PROJECT_VERSION = 4;/);

const checkout = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(checkout, /buy-sell\.html\?connect=refresh/);
assert.match(checkout, /buy-sell\.html\?connect=return/);
assert.doesNotMatch(checkout, /market\.html\?connect=/);

const buySell = fs.readFileSync("buy-sell.html", "utf8");
assert.match(buySell, /applyConnectReturnFromQuery/);
assert.match(buySell, /connect === "return"/);
assert.match(buySell, /sellerConnectStartBtn/);
assert.match(buySell, /marketplace_connect_onboard/);
assert.match(buySell, /startSellerConnectOnboarding/);

const i18n = fs.readFileSync("havkar-i18n.js", "utf8");
assert.match(i18n, /MESSAGING_GLOSSARY/);
assert.match(i18n, /"Block user": "مسدود کردن کاربر"/);
assert.match(i18n, /"No notifications": "اعلانی نیست"/);
assert.match(i18n, /messagingGlossary\(targetLanguage\)/);

console.log("PLATFORM_VOICE_PUSH_CONNECT_TEST_OK");
