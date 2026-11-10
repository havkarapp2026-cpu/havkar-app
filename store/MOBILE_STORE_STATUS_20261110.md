# Android / iOS status — 10 November 2026 (final global audit)

## ANDROID: BLOCKED (for Play worldwide production)

| Item | Status |
| --- | --- |
| Package `online.havkar.app` | Ready in repo (versionCode 2 / 1.0.0) |
| Last successful signed AAB CI | run `42744481961` tag `havkar-android-signed-20261110a` · jarsigner-strict + fingerprint OK · artifact not expired |
| Play Console closed testing / 12 testers / 14 days | **No Console proof** — Owner only |
| Production track publish | Not claimed / not performed |

## IOS: BLOCKED

| Item | Status |
| --- | --- |
| Bundle ID | `online.havkar.app` |
| Secrets (Team/cert/ASC) | present |
| `APPLE_PROVISIONING_PROFILE_BASE64` | missing |
| Latest signed IPA attempt | run `42744829769` — ARCHIVE OK · EXPORT exit 70 (cloud signing / no profiles) |
| TestFlight / App Store submit | Not produced |

## Payments in stores

IAP / Play Billing not armed. Public Stripe card gates remain paused.
