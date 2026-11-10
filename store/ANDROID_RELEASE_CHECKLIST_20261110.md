# Android final release checklist — 10 November 2026

Package: `online.havkar.app`  
Branch versions: `versionCode=3`, `versionName=1.0.1`  
WebView UA: `HAVKAR-Android/1.0.1`  
targetSdk: 36 · minSdk: 24 · cleartext: false · INTERNET only · release `isDebuggable=false`

## Artifact

| Step | Owner / Agent | Status |
| --- | --- | --- |
| Signed AAB via workflow `Android release AAB` mode `signed` | CI run `42886038671` (tag trigger) | **PASS** |
| jarsigner -strict vs upload keystore | CI + `tests/android-aab-signing-verify.test.sh` | **PASS** |
| Package / versionCode / non-debuggable verified from AAB manifest | bundletool dump | **PASS** |
| Play App Signing enrollment | Owner Console | Owner |
| Upload to Closed testing | Owner — see `store/PLAY_CLOSED_TESTING_RELEASE_20261110.md` | Pending Owner |
| Invented testers / 14-day evidence | Forbidden | Not done |

## Console declarations

| Item | Draft | Gate |
| --- | --- | --- |
| Data Safety | `store/PLAY_DATA_SAFETY.md` | Align to final AAB |
| Financial features | `store/PLAY_FINANCIAL_FEATURES.md` + `EU_CRYPTO_DECLARATION_OPTIONS_20261110.md` | Counsel for A/B/C |
| Country targeting | Matrix `PLAY_CRYPTO_COUNTRY_MATRIX_20261110.md` | Owner |
| Account deletion URL | `https://havkar.online/privacy-request.html` | Live request form (not instant delete) |
| Privacy / support | Canonical havkar.online URLs | Owner verify |
| App access | `store/PLAY_APP_ACCESS.md` | Owner pastes password in Console only |

## Functional (WebView → Production web)

| Module | Expected |
| --- | --- |
| Login / OAuth | Canonical host |
| Media upload | WebChromeClient file chooser |
| Buy & Sell / Services / Jobs / Ads / Events / Delivery / Chat | Existing web modules |
| Search hub | `search.html` |
| XLM pay | Testnet until LIVE_COLLECTION; geo enforcement optional |
| Stripe / Pi | Remain OFF |

## Security

- No cleartext HTTP
- Navigation allowlist in `HavkarLinks`
- No secrets in APK assets
- Crypto geo server-enforced when Owner enables flag (client bypass resisted)
- Production gates verified paused for card/Pi (`REAL_PAYMENTS_PAUSED`)

## Do not claim

- Closed testing duration completed
- MiCA license
- Production geo enforcement enabled
- Play upload completed by agent
