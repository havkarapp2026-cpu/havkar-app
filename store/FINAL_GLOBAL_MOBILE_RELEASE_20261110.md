# HAVKAR final global Android & iOS release audit — 10 November 2026

Public card collection remains **paused**. No store publish and no live-payment enablement performed by the agent.

## Verdicts

| Platform | Verdict | Meaning |
| --- | --- | --- |
| **ANDROID** | **BLOCKED** | Signed Play upload AAB exists in CI, but there is **no Play Console proof** of Closed testing / 12 testers / 14-day rule / production track. Worldwide Play production is not claimable. |
| **IOS** | **BLOCKED** | Archive succeeds; **no production IPA**. Export fails with cloud signing / missing App Store profile. No TestFlight / App Store Connect submit proof. |

## Production gates (re-checked)

| Flag | Value |
| --- | --- |
| `customer_facing_collection` | `paused` |
| `HAVKAR_REAL_PAYMENTS_ENABLED` | `false` |
| `HAVKAR_STRIPE_LIVE_ENABLED` | `false` |
| `live_collection_allowed` | `false` |
| Stellar Mainnet collection | armed (separate rail; not Play Billing / IAP) |

## Android evidence

| Item | Result |
| --- | --- |
| Package / versions | `online.havkar.app` · versionCode `2` · versionName `1.0.0` · targetSdk 36 |
| Permissions | `INTERNET` only · cleartext disabled |
| Signed CI | run [42744481961](https://github.com/havkarapp2026-cpu/havkar-app/actions/runs/42744481961) · tag `havkar-android-signed-20261110a` · **success** |
| AAB size | 2 686 896 bytes |
| jarsigner | `-strict` vs upload keystore **PASS** · SHA-256 fingerprint match **PASS** |
| Artifact | `havkar-app-release-signed-42744481961` · id `13730741830` · **not expired** at audit time |
| Play Console upload / Closed testing / production | **NOT verified** (no Console access from agent) |

## iOS evidence

| Item | Result |
| --- | --- |
| Bundle ID | `online.havkar.app` |
| Repo preflight | **PASS** |
| Secrets present (names only) | Team ID, Distribution cert+password, ASC API key/id/issuer = **true** |
| `APPLE_PROVISIONING_PROFILE_BASE64` | **false** (missing) |
| Latest signed attempt | run [42744829769](https://github.com/havkarapp2026-cpu/havkar-app/actions/runs/42744829769) · tag `havkar-ios-signed-20261110b` |
| Archive | `** ARCHIVE SUCCEEDED **` |
| Export | exit **70** · `Cloud signing permission error` · `No profiles for 'online.havkar.app' were found` |
| IPA / TestFlight / App Store review | **none** |

## Legal / compliance (production web)

| Item | Result |
| --- | --- |
| `https://havkar.online/privacy.html` | 200 · still labeled **draft** · counsel review required |
| `https://havkar.online/privacy-request.html` | 200 · stores deletion/export **request** · does **not** instant-delete |
| `https://havkar.online/terms.html` / `support.html` | 200 |
| Entity draft | HAVKAR DI JALILNIA AMIR · KR234170 · Crotone address · Italian VAT unpublished pending Visura |
| Store listing drafts | Updated to canonical `havkar.online` URLs in repo (this audit) |

## Tests run this audit

- `scripts/ios-release-preflight.sh` → PASS
- `tests/android-aab-signing-verify.test.sh` → PASS
- `tests/privacy-request.test.mjs` → PASS
- `tests/play-review-entitlement.test.mjs` → PASS
- `tests/real-payments-pause.test.mjs` → PASS
- `tests/legal-drafts.test.mjs` → PASS after privacy wording fix (canonical host + no premature VAT claim word)
- Production navigation probes: `/`, login, profile, privacy, privacy-request, terms, support, buy-sell, delivery → HTTP 200
- `scripts/verify-payment-activation-gates.mjs` → activation `paused`

## Exact Owner actions required

### Android (to leave BLOCKED → upload-ready Console path)
1. Download artifact from run `42744481961`.
2. Play Console → upload AAB to **Closed testing** (do not claim production early).
3. Invite **≥ 12** testers; keep track active **≥ 14 days**.
4. Paste Data safety / IARC / listing / App Access from `store/PLAY_DATA_SAFETY.md`, `store/LISTING.md`, `store/PLAY_APP_ACCESS.md` after counsel review.
5. Only after Google eligibility: promote production countries. Agent will not publish.

### iOS (to leave BLOCKED → IPA)
1. Create App Store Distribution provisioning profile for `online.havkar.app` **or** enable ASC cloud signing for the API key.
2. Add GitHub secret `APPLE_PROVISIONING_PROFILE_BASE64` (preferred when cloud signing is denied).
3. Push tag `havkar-ios-signed-<date>` (or Actions `signed_ipa`) and confirm IPA artifact.
4. Upload to TestFlight; App Store public submit only after explicit Owner approval.

### Legal (both stores)
1. Counsel finalize privacy/terms (remove “draft” only after review).
2. Confirm Visura / Italian VAT publication decision.
3. Keep public card gates OFF until separate written payment activation approval.

## Explicit non-claims

- Google Play production worldwide access: **NOT proven**
- Apple App Store listing / IPA: **NOT produced**
- Public live card payments: **remain OFF**
EOF
