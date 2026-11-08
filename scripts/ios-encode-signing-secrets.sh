#!/usr/bin/env bash
# Encode local Apple signing materials for GitHub Actions secrets.
# Run on a trusted machine that already has the .p12 / .p8 files.
# Never commit the output, the .p12, the .p8, or passwords to git.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/ios-encode-signing-secrets.sh certificate <Distribution.p12>
  scripts/ios-encode-signing-secrets.sh api-key <AuthKey_XXXXXX.p8>

Prints base64 suitable for pasting into GitHub Actions secrets:
  APPLE_DISTRIBUTION_CERTIFICATE_BASE64
  APP_STORE_CONNECT_API_KEY   (optional base64 form; raw PEM text also works)
EOF
}

if [[ $# -ne 2 ]]; then
  usage
  exit 1
fi

mode="$1"
file="$2"

if [[ ! -f "$file" ]]; then
  echo "File not found: $file" >&2
  exit 1
fi

case "$mode" in
  certificate|api-key)
    # Single-line base64 for GitHub secret paste.
    if base64 --help 2>&1 | grep -q -- '-w'; then
      base64 -w 0 "$file"
      echo
    else
      base64 < "$file" | tr -d '\n'
      echo
    fi
    ;;
  *)
    usage
    exit 1
    ;;
esac
