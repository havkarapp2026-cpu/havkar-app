# iOS / App Store checklist — 10 November 2026

Bundle ID: `online.havkar.app`

## Technically fixed in repo

- iOS Export IPA CI step prints explicit Owner actions when IPA missing (cloud signing / Distribution profile / `APPLE_PROVISIONING_PROFILE_BASE64`).
- Repo preflight PASS (scheme, icons, secrets referenced not printed, no committed .p12/.p8).

## Remaining Owner-only blockers

1. App Store Connect API key with cloud signing permission **or** Distribution provisioning profile for `online.havkar.app`.
2. Re-run workflow **iOS Release** `signed_ipa`.
3. TestFlight internal/external groups.
4. App Privacy nutrition labels aligned to WebView data practices.
5. Crypto / IAP: digital subscriptions must use StoreKit; XLM recurring already refused in code. Territory crypto rules → counsel (do not invent).

## Not fabricated

- Certificates, profiles, TestFlight evidence, App Review results.
