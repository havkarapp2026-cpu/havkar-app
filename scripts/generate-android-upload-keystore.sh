#!/usr/bin/env bash
# One-shot local generator for HAVKAR Play upload keystore.
# Requires: AGE_RECIPIENT (public age1... only). Never prints passwords or private keys.
# Does not publish to Play. Does not enable payments.
set -euo pipefail

if [[ "${1:-}" != "CREATE_NEW_UPLOAD_KEY" ]]; then
  echo "Usage: AGE_RECIPIENT=age1... $0 CREATE_NEW_UPLOAD_KEY"
  echo "Refusing without confirmation phrase."
  exit 1
fi

if [[ -z "${AGE_RECIPIENT:-}" ]]; then
  echo "Missing AGE_RECIPIENT (public age1... line only)."
  exit 1
fi

case "$AGE_RECIPIENT" in
  age1*) ;;
  *)
    echo "AGE_RECIPIENT must start with age1"
    exit 1
    ;;
esac

for cmd in openssl keytool age shred; do
  command -v "$cmd" >/dev/null || {
    echo "Missing required command: $cmd"
    exit 1
  }
done

OUT_DIR="${HAVKAR_KEYSTORE_OUT_DIR:-$PWD/out-upload-keystore}"
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/havkar-upload-XXXXXX")"
chmod 700 "$WORK"
cleanup() {
  shred -u "$WORK"/* 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

KEY_ALIAS="${HAVKAR_UPLOAD_KEY_ALIAS_VALUE:-havkar-upload}"
KEYSTORE="$WORK/havkar-upload.p12"
CREDS="$WORK/credentials.txt"
BUNDLE="$WORK/havkar-upload-backup.tar"
ENC="$OUT_DIR/havkar-upload-backup.tar.age"
FP_OUT="$OUT_DIR/havkar-upload-cert-sha256.txt"

STORE_PASS="$(openssl rand -base64 32)"
KEY_PASS="$(openssl rand -base64 32)"

keytool -genkeypair \
  -keystore "$KEYSTORE" \
  -storetype PKCS12 \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias "$KEY_ALIAS" \
  -storepass "$STORE_PASS" \
  -keypass "$KEY_PASS" \
  -dname "CN=HAVKAR Upload, OU=HAVKAR, O=HAVKAR, L=Unknown, ST=Unknown, C=IT" \
  >/dev/null

# Public certificate fingerprint only (safe to share).
keytool -list -v \
  -keystore "$KEYSTORE" \
  -storetype PKCS12 \
  -alias "$KEY_ALIAS" \
  -storepass "$STORE_PASS" \
  2>/dev/null | awk '
    /SHA256:/ {
      line=$0
      sub(/^.*SHA256:/, "", line)
      gsub(/ /, "", line)
      print line
      exit
    }
  ' >"$FP_OUT"
chmod 600 "$FP_OUT"

umask 077
{
  echo "HAVKAR_UPLOAD_KEY_ALIAS=$KEY_ALIAS"
  echo "HAVKAR_UPLOAD_STORE_PASSWORD=$STORE_PASS"
  echo "HAVKAR_UPLOAD_KEY_PASSWORD=$KEY_PASS"
  echo "HAVKAR_UPLOAD_KEYSTORE_FILE=havkar-upload.p12"
  echo "NOTE=After decrypt, base64 the p12 into HAVKAR_UPLOAD_KEYSTORE_BASE64 and set the three other secrets. Keep this backup offline."
} >"$CREDS"

tar -C "$WORK" -cf "$BUNDLE" havkar-upload.p12 credentials.txt
age -r "$AGE_RECIPIENT" -o "$ENC" "$BUNDLE"
chmod 600 "$ENC"

unset STORE_PASS KEY_PASS
shred -u "$KEYSTORE" "$CREDS" "$BUNDLE" 2>/dev/null || rm -f "$KEYSTORE" "$CREDS" "$BUNDLE"

if [[ ! -s "$ENC" ]]; then
  echo "Encrypted backup missing."
  exit 1
fi

echo "ENCRYPTED_BACKUP=$ENC"
echo "CERT_SHA256_FILE=$FP_OUT"
echo "BYTES=$(wc -c <"$ENC" | tr -d ' ')"
echo "Plaintext keystore and passwords removed from the work directory."
