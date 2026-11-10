# Google Play Closed Testing — AAB package (10 November 2026)

Agent does **not** upload or publish. Owner uploads after review.

## Exact artifact for Owner download

| Field | Value |
| --- | --- |
| CI run | `42886038671` |
| Workflow | Android release AAB (signed) |
| Tag | `havkar-android-signed-v101-202611101930` |
| Commit | `ce2e5fd354ec64e0419f1ec4e3d61c8aa214c61e` |
| Artifact name | `havkar-app-release-signed-42886038671` |
| Artifact id | `13795957867` |
| File inside zip | `app-release.aab` |
| Size | 2686902 bytes |
| SHA-256 (AAB) | `ee69b57a899d405cd0fb05144d52a55fd3424138bddcc7e43ae4d3c31df8757d` |
| Package | `online.havkar.app` |
| versionCode | `3` |
| versionName | `1.0.1` |
| Debuggable | No (`android:debuggable` absent; release `isDebuggable=false`) |
| Cleartext HTTP | Disabled |

### Download links (Owner GitHub login required)

Run page:

```
https://github.com/havkarapp2026-cpu/havkar-app/actions/runs/42886038671
```

Artifact API (authenticated):

```
https://github.com/havkarapp2026-cpu/havkar-app/actions/runs/42886038671/artifacts/13795957867
```

Agent local verified copy (same SHA-256):

```
/opt/cursor/artifacts/android-aab-signed-run/havkar-app-release-signed-42886038671/app-release.aab
```

Owner download copy + checksum sidecar:

```
/opt/cursor/artifacts/play-closed-testing/online.havkar.app-v1.0.1-vc3-run42886038671.aab
/opt/cursor/artifacts/play-closed-testing/online.havkar.app-v1.0.1-vc3-run42886038671.aab.sha256
```

## Signing verification

| Check | Result |
| --- | --- |
| CI `scripts/verify-android-aab-signing.sh` | PASS — jarsigner `-strict` vs upload keystore + SHA-256 fingerprint match |
| Local `jarsigner -verify` (non-strict) | PASS — `jar verified` |
| Cert subject | `CN=HAVKAR Upload, OU=HAVKAR, O=HAVKAR, C=IT` |
| Cert SHA-256 | `40:26:C5:0B:F4:A4:7E:20:38:78:F4:2C:A3:FA:9D:84:31:1B:31:D9:EF:CB:5F:A2:B5:12:95:0E:A6:64:00:8B` |
| Synthetic verifier suite | PASS (`tests/android-aab-signing-verify.test.sh`) |

## Production payment gates (backend the WebView loads)

Observed live on `https://havkar.online` and `https://havkar-app.vercel.app` (2026-11-10):

| Gate | Status |
| --- | --- |
| `HAVKAR_REAL_PAYMENTS_ENABLED` | `false` |
| `HAVKAR_STRIPE_LIVE_ENABLED` | `false` |
| Stripe webhook unsigned POST | `REAL_PAYMENTS_PAUSED` |
| Customer-facing card/Pi collection | `paused` |
| Stripe `live_collection_allowed` | `false` |
| `HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED` | `true` (armed; not the same as customer live collection) |
| `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION` | Not set to exact `true` → customer Mainnet quotes stay OFF by server code |

Do **not** enable LIVE_COLLECTION or card rails for Closed Testing.

## Closed Testing Owner checklist (Play Console)

1. Open Play Console → HAVKAR (`online.havkar.app`) → Testing → Closed testing.
2. Create or select a closed track; create a new release.
3. Upload `app-release.aab` from run `42886038671` (verify SHA-256 before upload).
4. Confirm Play App Signing enrollment uses this upload certificate fingerprint.
5. Complete / refresh: Data safety (`store/PLAY_DATA_SAFETY.md`), Financial features (`store/PLAY_FINANCIAL_FEATURES.md`), App access (`store/PLAY_APP_ACCESS.md` — paste reviewer password only in Console), Content rating, Privacy policy URL `https://havkar.online/privacy.html`.
6. Country targeting: follow counsel + `store/PLAY_CRYPTO_COUNTRY_MATRIX_20261110.md` / `store/EU_CRYPTO_DECLARATION_OPTIONS_20261110.md`. Do not submit unverified MiCA/CASP claims.
7. Add real closed testers only (do not invent testers).
8. Save → Review release → Start rollout to closed testing (**Owner only**).
9. Keep production payment env flags unchanged.

## Backend compatibility

Android app is a WebView shell:

- Start URL: `https://havkar.online/`
- Allowlist: `havkar.online`, `www.havkar.online`, `*.havkar.online`, `havkar-app.vercel.app`
- UA suffix: `HAVKAR-Android/1.0.1`
- Login, marketplace, wallet, and payment UI come from the live web backend with current gates.

## Explicit non-actions

- No Play upload by agent
- No production migration
- No LIVE_COLLECTION / REAL_PAYMENTS enablement
- No merge/deploy without Owner approval
