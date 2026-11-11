#!/usr/bin/env bash
# Import Apple Distribution certificate (+ optional provisioning profile)
# into a temporary keychain on macOS GitHub Actions runners.
#
# Uses Apple's built-in `security` CLI (always present on macos-* runners).
# Never echoes secret values. Never writes materials into the git worktree.
#
# Required env:
#   APPLE_DISTRIBUTION_CERTIFICATE_BASE64
#   APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD
# Optional env:
#   APPLE_PROVISIONING_PROFILE_BASE64
#   HAVKAR_KEYCHAIN_PATH   (default: $RUNNER_TEMP/havkar-signing.keychain-db)
#   HAVKAR_KEYCHAIN_PASSWORD (default: random)
#
# Usage:
#   scripts/ios-import-signing-materials.sh import
#   scripts/ios-import-signing-materials.sh cleanup
set -euo pipefail

cmd="${1:-import}"

KEYCHAIN_PATH="${HAVKAR_KEYCHAIN_PATH:-${RUNNER_TEMP:-/tmp}/havkar-signing.keychain-db}"
KEYCHAIN_PASSWORD="${HAVKAR_KEYCHAIN_PASSWORD:-}"
CERT_PATH="${RUNNER_TEMP:-/tmp}/havkar-distribution.p12"
PROFILE_DIR="${HOME}/Library/MobileDevice/Provisioning Profiles"
STATE_FILE="${RUNNER_TEMP:-/tmp}/havkar-signing-state.env"

log() { echo "$*"; }

require_mac() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This script requires macOS (security CLI)." >&2
    exit 1
  fi
}

write_state() {
  umask 077
  {
    echo "HAVKAR_KEYCHAIN_PATH=${KEYCHAIN_PATH}"
    echo "HAVKAR_KEYCHAIN_PASSWORD=${KEYCHAIN_PASSWORD}"
    echo "HAVKAR_CERT_PATH=${CERT_PATH}"
  } > "$STATE_FILE"
  chmod 600 "$STATE_FILE"
}

load_state() {
  if [[ -f "$STATE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$STATE_FILE"
    KEYCHAIN_PATH="${HAVKAR_KEYCHAIN_PATH}"
    KEYCHAIN_PASSWORD="${HAVKAR_KEYCHAIN_PASSWORD}"
    CERT_PATH="${HAVKAR_CERT_PATH:-$CERT_PATH}"
  fi
}

import_certificate() {
  require_mac

  if [[ -z "${APPLE_DISTRIBUTION_CERTIFICATE_BASE64:-}" ]]; then
    echo "Missing APPLE_DISTRIBUTION_CERTIFICATE_BASE64" >&2
    exit 1
  fi
  if [[ -z "${APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD:-}" ]]; then
    echo "Missing APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD" >&2
    exit 1
  fi

  if [[ -z "$KEYCHAIN_PASSWORD" ]]; then
    KEYCHAIN_PASSWORD="$(openssl rand -base64 32)"
  fi

  umask 077
  mkdir -p "$(dirname "$KEYCHAIN_PATH")" "${RUNNER_TEMP:-/tmp}"

  # Decode certificate to a temp file outside the repo.
  printf '%s' "$APPLE_DISTRIBUTION_CERTIFICATE_BASE64" | base64 --decode > "$CERT_PATH"
  chmod 600 "$CERT_PATH"
  cert_bytes="$(wc -c < "$CERT_PATH" | tr -d ' ')"
  if [[ "$cert_bytes" -lt 64 ]]; then
    echo "Decoded certificate looks empty/invalid (bytes=$cert_bytes)" >&2
    rm -f "$CERT_PATH"
    exit 1
  fi
  log "Decoded Distribution certificate bytes=$cert_bytes"

  # Recreate ephemeral keychain for this job.
  security delete-keychain "$KEYCHAIN_PATH" >/dev/null 2>&1 || true
  security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
  security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
  security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

  # Import PKCS#12; -A allows codesign/security to use the identity non-interactively.
  security import "$CERT_PATH" \
    -P "$APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD" \
    -A \
    -t cert \
    -f pkcs12 \
    -k "$KEYCHAIN_PATH"

  security set-key-partition-list \
    -S apple-tool:,apple:,codesign: \
    -s \
    -k "$KEYCHAIN_PASSWORD" \
    "$KEYCHAIN_PATH" >/dev/null

  # Put the temp keychain first without dropping login keychain.
  existing="$(security list-keychains -d user | sed 's/"//g' | tr '\n' ' ')"
  # shellcheck disable=SC2086
  security list-keychains -d user -s "$KEYCHAIN_PATH" $existing
  security default-keychain -s "$KEYCHAIN_PATH"
  security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

  # Presence check only — never print identity details that could include emails in CI noise.
  if ! security find-identity -v -p codesigning "$KEYCHAIN_PATH" | grep -q "1 valid identities found\|valid identities found"; then
    # Still accept if at least one identity line exists (count wording varies).
    if ! security find-identity -v -p codesigning "$KEYCHAIN_PATH" | grep -Eq '^[ ]*[0-9]+\)'; then
      echo "No codesigning identity found after certificate import" >&2
      security find-identity -v -p codesigning "$KEYCHAIN_PATH" || true
      exit 1
    fi
  fi
  identity_count="$(security find-identity -v -p codesigning "$KEYCHAIN_PATH" | grep -Ec '^[ ]*[0-9]+\)' || true)"
  log "Codesigning identities available in temp keychain: ${identity_count}"

  write_state

  # Remove plaintext p12 ASAP; keychain retains the imported identity for the job.
  rm -f "$CERT_PATH"
  log "Imported Apple Distribution certificate into temporary keychain"
}

install_profile() {
  require_mac
  if [[ -z "${APPLE_PROVISIONING_PROFILE_BASE64:-}" ]]; then
    log "No APPLE_PROVISIONING_PROFILE_BASE64 set; automatic provisioning will be used"
    return 0
  fi

  mkdir -p "$PROFILE_DIR"
  tmp_profile="${RUNNER_TEMP:-/tmp}/havkar.mobileprovision"
  printf '%s' "$APPLE_PROVISIONING_PROFILE_BASE64" | base64 --decode > "$tmp_profile"
  chmod 600 "$tmp_profile"
  profile_bytes="$(wc -c < "$tmp_profile" | tr -d ' ')"
  if [[ "$profile_bytes" -lt 64 ]]; then
    echo "Decoded provisioning profile looks empty/invalid (bytes=$profile_bytes)" >&2
    rm -f "$tmp_profile"
    exit 1
  fi

  # Prefer UUID filename when readable from the profile plist payload.
  uuid="$(
    security cms -D -i "$tmp_profile" 2>/dev/null \
      | plutil -extract UUID raw - 2>/dev/null \
      || true
  )"
  if [[ -n "$uuid" ]]; then
    dest="$PROFILE_DIR/${uuid}.mobileprovision"
  else
    dest="$PROFILE_DIR/havkar.mobileprovision"
  fi
  mv -f "$tmp_profile" "$dest"
  chmod 600 "$dest"
  log "Installed provisioning profile bytes=$profile_bytes name=$(basename "$dest")"
}

cleanup() {
  require_mac
  load_state
  if [[ -n "${KEYCHAIN_PATH:-}" && -f "$KEYCHAIN_PATH" ]]; then
    security delete-keychain "$KEYCHAIN_PATH" >/dev/null 2>&1 || true
    log "Deleted temporary signing keychain"
  fi
  rm -f "${CERT_PATH:-}" "$STATE_FILE" "${RUNNER_TEMP:-/tmp}/havkar.mobileprovision"
  # Do not delete installed .mobileprovision files from PROFILE_DIR globally;
  # runners are ephemeral. Best-effort remove our named copies if present.
  rm -f "$PROFILE_DIR/havkar.mobileprovision"
}

case "$cmd" in
  import)
    import_certificate
    install_profile
    ;;
  cleanup)
    cleanup
    ;;
  *)
    echo "Usage: $0 import|cleanup" >&2
    exit 1
    ;;
esac
