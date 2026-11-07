#!/usr/bin/env bash
# Exercises scripts/verify-android-aab-signing.sh without Android SDK/Play publish.
# Uses throwaway PKCS12 keystores only. Never touches GitHub secrets or production keys.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERIFY="$ROOT/scripts/verify-android-aab-signing.sh"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

chmod +x "$VERIFY"

PASS='test-store-pass-not-secret'
ALIAS='upload'

keytool -genkeypair \
  -keystore "$TMP/upload.p12" \
  -storetype PKCS12 \
  -storepass "$PASS" \
  -keypass "$PASS" \
  -alias "$ALIAS" \
  -dname 'CN=HAVKAR Test Upload, O=HAVKAR, C=US' \
  -keyalg RSA \
  -keysize 2048 \
  -validity 365 \
  >/dev/null 2>&1

keytool -genkeypair \
  -keystore "$TMP/other.p12" \
  -storetype PKCS12 \
  -storepass "$PASS" \
  -keypass "$PASS" \
  -alias "$ALIAS" \
  -dname 'CN=Other Upload, O=Other, C=US' \
  -keyalg RSA \
  -keysize 2048 \
  -validity 365 \
  >/dev/null 2>&1

echo 'payload' >"$TMP/file.txt"
(
  cd "$TMP"
  jar cf signed.jar file.txt
  jarsigner -keystore upload.p12 -storepass "$PASS" -keypass "$PASS" signed.jar "$ALIAS" >/dev/null 2>&1
  jar cf unsigned.jar file.txt
)

export HAVKAR_UPLOAD_STORE_FILE="$TMP/upload.p12"
export HAVKAR_UPLOAD_STORE_PASSWORD="$PASS"
export HAVKAR_UPLOAD_KEY_ALIAS="$ALIAS"

echo 'CASE 1: correctly signed artifact must pass'
"$VERIFY" "$TMP/signed.jar"

echo 'CASE 2: unsigned artifact must fail'
if "$VERIFY" "$TMP/unsigned.jar" >/tmp/havkar-aab-verify-unsigned.txt 2>&1; then
  echo 'EXPECTED FAILURE for unsigned jar, but verifier passed'
  exit 1
fi
grep -qi 'not signed with the upload key\|jar is unsigned\|unsigned' /tmp/havkar-aab-verify-unsigned.txt

echo 'CASE 3: wrong keystore must fail'
export HAVKAR_UPLOAD_STORE_FILE="$TMP/other.p12"
if "$VERIFY" "$TMP/signed.jar" >/tmp/havkar-aab-verify-wrong.txt 2>&1; then
  echo 'EXPECTED FAILURE for wrong keystore, but verifier passed'
  exit 1
fi
grep -qiE 'does not match|verification failed' /tmp/havkar-aab-verify-wrong.txt
# Wrong-key must not be misclassified as unsigned.
if grep -qi 'AAB is not signed with the upload key' /tmp/havkar-aab-verify-wrong.txt; then
  echo 'Wrong keystore was misclassified as unsigned'
  exit 1
fi

echo 'CASE 4: plain jarsigner -strict without keystore fails on self-signed upload cert (root-cause guard)'
set +e
jarsigner -verify -strict "$TMP/signed.jar" >/tmp/havkar-aab-verify-plain-strict.txt 2>&1
PLAIN_EC=$?
set -e
if [[ "$PLAIN_EC" -eq 0 ]]; then
  echo 'Unexpected: plain jarsigner -strict succeeded on self-signed cert'
  exit 1
fi
grep -qiE 'self-signed|certificate chain|signer errors' /tmp/havkar-aab-verify-plain-strict.txt

echo 'All android AAB signing verifier tests passed.'
