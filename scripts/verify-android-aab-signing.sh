#!/usr/bin/env bash
# Verify a Play-upload-signed AAB against the HAVKAR upload keystore.
# Does not print passwords, private keys, or certificate fingerprints.
# Does not publish to Play. Does not enable payments.
#
# Usage:
#   HAVKAR_UPLOAD_STORE_FILE=... \
#   HAVKAR_UPLOAD_STORE_PASSWORD=... \
#   HAVKAR_UPLOAD_KEY_ALIAS=... \
#   ./scripts/verify-android-aab-signing.sh path/to/app-release.aab
#
# Why -keystore is required with -strict:
# Android Play upload certificates are self-signed by design. Plain
# `jarsigner -verify -strict` exits non-zero (typically 4) with
# "signer certificate is self-signed" / PKIX path errors even when the
# JAR signature is cryptographically valid. Passing the upload keystore
# lets jarsigner treat that expected self-signed cert as trusted for
# -strict checks, without relaxing unsigned or wrong-key failures.
set -euo pipefail

AAB="${1:-}"
if [[ -z "$AAB" || ! -f "$AAB" ]]; then
  echo "Usage: $0 <path-to-signed.aab>"
  exit 1
fi

missing=0
for var in HAVKAR_UPLOAD_STORE_FILE HAVKAR_UPLOAD_STORE_PASSWORD HAVKAR_UPLOAD_KEY_ALIAS; do
  if [[ -z "${!var:-}" ]]; then
    echo "Missing required env: $var"
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  exit 1
fi
if [[ ! -s "$HAVKAR_UPLOAD_STORE_FILE" ]]; then
  echo "Upload keystore file is missing or empty."
  exit 1
fi

for cmd in jarsigner keytool; do
  command -v "$cmd" >/dev/null || {
    echo "Missing required command: $cmd"
    exit 1
  }
done

VERIFY_OUT="$(mktemp)"
FP_STORE_OUT="$(mktemp)"
FP_AAB_OUT="$(mktemp)"
cleanup() {
  rm -f "$VERIFY_OUT" "$FP_STORE_OUT" "$FP_AAB_OUT"
}
trap cleanup EXIT

set +e
jarsigner -verify -strict \
  -keystore "$HAVKAR_UPLOAD_STORE_FILE" \
  -storepass:env HAVKAR_UPLOAD_STORE_PASSWORD \
  "$AAB" >"$VERIFY_OUT" 2>&1
VERIFY_EC=$?
set -e

# Only treat truly unsigned jars here. Do not match the phrase
# "not signed by alias in this keystore" (wrong-key case).
if grep -qiE '(^|[[:space:]])jar is unsigned\.?($|[[:space:]])|no manifest' "$VERIFY_OUT"; then
  echo "AAB is not signed with the upload key."
  exit 1
fi

if [[ "$VERIFY_EC" -ne 0 ]]; then
  echo "Signed AAB jarsigner -strict verification failed (exit $VERIFY_EC)."
  echo "The upload keystore did not validate this AAB signature under -strict."
  exit 1
fi

if ! grep -qi 'jar verified' "$VERIFY_OUT"; then
  echo "AAB jarsigner output did not confirm jar verified."
  exit 1
fi

sha256_fingerprint() {
  # Normalize "SHA256: AA:BB:..." lines from keytool to uppercase colon hex.
  awk -F': ' 'BEGIN{IGNORECASE=1} $1 ~ /^[[:space:]]*SHA256$/ {
    gsub(/[[:space:]]/, "", $2)
    print toupper($2)
    exit
  }'
}

keytool -list -v \
  -keystore "$HAVKAR_UPLOAD_STORE_FILE" \
  -storepass:env HAVKAR_UPLOAD_STORE_PASSWORD \
  -alias "$HAVKAR_UPLOAD_KEY_ALIAS" >"$FP_STORE_OUT" 2>&1 || {
  echo "Could not read upload keystore alias for fingerprint check."
  exit 1
}

keytool -printcert -jarfile "$AAB" >"$FP_AAB_OUT" 2>&1 || {
  echo "Could not read AAB signing certificate for fingerprint check."
  exit 1
}

STORE_FP="$(sha256_fingerprint <"$FP_STORE_OUT")"
AAB_FP="$(sha256_fingerprint <"$FP_AAB_OUT")"

if [[ -z "$STORE_FP" || -z "$AAB_FP" ]]; then
  echo "Could not extract SHA-256 certificate fingerprints for comparison."
  exit 1
fi

if [[ "$STORE_FP" != "$AAB_FP" ]]; then
  echo "AAB signer certificate does not match the upload keystore alias."
  exit 1
fi

echo "jarsigner -strict verification passed against the upload keystore."
echo "Upload key SHA-256 certificate fingerprint matches the AAB signer."
