#!/usr/bin/env bash
# Local/CI preflight for HAVKAR iOS release readiness.
# Never prints secret values. Exit 0 when repo-side checks pass.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPORT="${1:-}"
PASS=1

ok() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; PASS=0; }
info() { echo "INFO: $*"; }

PROJECT="ios/HAVKAR.xcodeproj/project.pbxproj"
ICON="ios/HAVKAR/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
SCHEME="ios/HAVKAR.xcodeproj/xcshareddata/xcschemes/HAVKAR.xcscheme"
WF=".github/workflows/ios-release.yml"

[[ -f "$PROJECT" ]] && ok "Xcode project present" || fail "missing $PROJECT"
[[ -f "$SCHEME" ]] && ok "Shared scheme HAVKAR present" || fail "missing $SCHEME"
[[ -f "$ICON" ]] && ok "AppIcon-1024.png present" || fail "missing $ICON"
[[ -f "$WF" ]] && ok "ios-release.yml present in this checkout" || fail "missing $WF"
[[ -f "ios/ExportOptions.plist.example" ]] && ok "ExportOptions example present" || fail "missing ExportOptions example"

if [[ -f "$PROJECT" ]]; then
  if grep -q 'PRODUCT_BUNDLE_IDENTIFIER = online.havkar.app;' "$PROJECT"; then
    ok "Bundle ID online.havkar.app"
  else
    fail "Bundle ID online.havkar.app not found in project.pbxproj"
  fi
  if grep -q 'CODE_SIGNING_ALLOWED = NO;' "$PROJECT"; then
    info "project keeps CODE_SIGNING_ALLOWED=NO (Simulator CI); Release workflow overrides at archive time"
  fi
  if grep -q 'DEVELOPMENT_TEAM = "";' "$PROJECT"; then
    info "DEVELOPMENT_TEAM empty in project (expected; supplied via APPLE_TEAM_ID secret in CI)"
  fi
  if grep -q 'ProvisioningStyle = Automatic;' "$PROJECT"; then
    ok "ProvisioningStyle=Automatic (CI automatic signing friendly)"
  elif grep -q 'ProvisioningStyle = Manual;' "$PROJECT"; then
    info "ProvisioningStyle=Manual in project attributes (workflow still forces CODE_SIGN_STYLE=Automatic)"
  fi
fi

if [[ -f "$ICON" ]]; then
  python3 - <<'PY'
import sys
path = "ios/HAVKAR/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
data = open(path, "rb").read()
if data[:8] != b"\x89PNG\r\n\x1a\n":
    print("FAIL: AppIcon is not a PNG")
    sys.exit(2)
color = data[25]
if color in (4, 6):
    print(f"FAIL: AppIcon has alpha (color_type={color})")
    sys.exit(2)
print(f"PASS: AppIcon opaque PNG color_type={color}")
PY
fi

if [[ -f "$WF" ]]; then
  grep -q 'workflow_dispatch:' "$WF" && ok "Release workflow is workflow_dispatch" || fail "missing workflow_dispatch"
  if grep -Eq '^[[:space:]]+push:' "$WF"; then
    fail "ios-release.yml must not trigger on push"
  else
    ok "Release workflow does not trigger on push"
  fi
  if grep -q 'apple-actions/import-codesigning-certs' "$WF"; then
    fail "workflow still references invalid action apple-actions/import-codesigning-certs (repo does not exist)"
  else
    ok "workflow does not reference invalid import-codesigning-certs action"
  fi
  if grep -q 'scripts/ios-import-signing-materials.sh' "$WF"; then
    ok "workflow imports signing materials via security CLI script"
  else
    fail "workflow missing scripts/ios-import-signing-materials.sh import step"
  fi
  for s in \
    APPLE_TEAM_ID \
    APPLE_DISTRIBUTION_CERTIFICATE_BASE64 \
    APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD \
    APP_STORE_CONNECT_API_KEY_ID \
    APP_STORE_CONNECT_ISSUER_ID \
    APP_STORE_CONNECT_API_KEY
  do
    grep -q "$s" "$WF" && ok "workflow references secret $s" || fail "workflow missing secret $s"
  done
fi

[[ -f "scripts/ios-import-signing-materials.sh" ]] && ok "ios-import-signing-materials.sh present" || fail "missing import script"
if [[ -f "scripts/ios-import-signing-materials.sh" ]]; then
  bash -n scripts/ios-import-signing-materials.sh && ok "import script bash syntax OK" || fail "import script bash syntax error"
fi

# Detect committed signing materials (should never exist).
BAD=$(find ios .github scripts store -type f \( -name '*.p12' -o -name '*.p8' -o -name '*.mobileprovision' -o -name '*.ipa' -o -name 'AuthKey_*.p8' \) 2>/dev/null | head -n 20 || true)
if [[ -n "${BAD}" ]]; then
  fail "signing materials present in repo paths:\n${BAD}"
else
  ok "no .p12/.p8/.mobileprovision/.ipa committed under tracked iOS paths"
fi

info "GitHub Actions lists workflow_dispatch workflows from the default branch only"
info "Apple secret values cannot be read by this script (and must never be printed)"

if [[ -n "$REPORT" ]]; then
  {
    echo "havkar_ios_preflight_ok=$PASS"
    echo "bundle_id=online.havkar.app"
    echo "workflow_file=$WF"
    date -u +'checked_at=%Y-%m-%dT%H:%M:%SZ'
  } > "$REPORT"
fi

if [[ "$PASS" -eq 1 ]]; then
  echo "RESULT: repo preflight PASS"
  exit 0
fi
echo "RESULT: repo preflight FAIL"
exit 1
