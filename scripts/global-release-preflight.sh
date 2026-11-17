#!/usr/bin/env bash
# HAVKAR global iOS + Android release preflight (no secrets printed).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FAIL=0

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; FAIL=1; }
info() { echo "INFO: $*"; }

echo "=== iOS ==="
if bash "$ROOT/scripts/ios-release-preflight.sh"; then
  pass "ios-release-preflight"
else
  fail "ios-release-preflight"
fi
grep -q 'NSCameraUsageDescription' ios/HAVKAR/Info.plist && pass "iOS camera usage string" || fail "iOS camera usage string"
grep -q 'NSLocationWhenInUseUsageDescription' ios/HAVKAR/Info.plist && pass "iOS location usage string" || fail "iOS location usage string"
grep -q 'MARKETING_VERSION = 1.0.4' ios/HAVKAR.xcodeproj/project.pbxproj && pass "iOS marketing 1.0.4" || fail "iOS marketing version"
grep -q 'CURRENT_PROJECT_VERSION = 4' ios/HAVKAR.xcodeproj/project.pbxproj && pass "iOS build 4" || fail "iOS build number"
grep -q 'NSPrivacyAccessedAPICategoryUserDefaults' ios/HAVKAR/PrivacyInfo.xcprivacy && pass "PrivacyInfo API reasons" || fail "PrivacyInfo API reasons"
info "Signed IPA/TestFlight still requires GitHub secrets: APPLE_TEAM_ID, APPLE_DISTRIBUTION_CERTIFICATE_BASE64, APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD, APP_STORE_CONNECT_API_KEY_ID, APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_API_KEY, and preferably APPLE_PROVISIONING_PROFILE_BASE64"

echo "=== Android ==="
grep -q 'versionCode = 4' android/app/build.gradle.kts && pass "Android versionCode 4" || fail "Android versionCode"
grep -q 'versionName = "1.0.4"' android/app/build.gradle.kts && pass "Android versionName 1.0.4" || fail "Android versionName"
grep -q 'applicationId = "online.havkar.app"' android/app/build.gradle.kts && pass "Android applicationId" || fail "Android applicationId"
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  if [[ -f "android/app/src/main/res/mipmap-$d/ic_launcher.png" ]]; then
    pass "mipmap-$d/ic_launcher.png"
  else
    fail "mipmap-$d/ic_launcher.png"
  fi
done
[[ -f .github/workflows/android-release-aab.yml ]] && pass "android-release-aab workflow" || fail "android-release-aab workflow"
info "Signed AAB requires GitHub secrets: HAVKAR_UPLOAD_KEYSTORE_BASE64, HAVKAR_UPLOAD_STORE_PASSWORD, HAVKAR_UPLOAD_KEY_ALIAS, HAVKAR_UPLOAD_KEY_PASSWORD"
info "Play Console Closed testing / production publish remains Owner Console action"

echo "=== Web gates (honest) ==="
grep -q 'missing_OMIO_AFFILIATE_ID\|OMIO_AFFILIATE_ID' lib/omio-adapter.cjs && pass "Omio affiliate honesty" || fail "Omio adapter"
grep -q 'HAVKAR_TURN_' lib/telehealth-adapter.cjs && pass "Telehealth TURN secret names documented" || fail "Telehealth TURN docs"
grep -q 'partitaIva: ""' havkar-operator-config.js && pass "Partita IVA unpublished" || fail "Partita IVA guard"

if [[ "$FAIL" -eq 0 ]]; then
  echo "RESULT: global release preflight PASS (signed store uploads still depend on Owner secrets/console)"
  exit 0
fi
echo "RESULT: global release preflight FAIL"
exit 1
