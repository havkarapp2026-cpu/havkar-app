# Android final release checklist — 10 November 2026

Package: `online.havkar.app`  
Branch versions: `versionCode=3`, `versionName=1.0.1`  
WebView UA: `HAVKAR-Android/1.0.1`  
targetSdk: 36 · minSdk: 24 · cleartext: false · INTERNET only

## Artifact

| Step | Owner / Agent | Status |
| --- | --- | --- |
| Signed AAB via workflow `Android release AAB` mode `signed` | Owner (agent dispatch often 403) | Pending Owner |
| jarsigner -strict vs upload keystore | Script + CI | Verifier PASS locally on synthetic cases |
| Play App Signing enrollment | Owner Console | Owner |
| Upload to Closed testing | Owner | Pending |
| Invented testers / 14-day evidence | Forbidden | Not done |

## Console declarations

| Item | Draft | Gate |
| --- | --- | --- |
| Data Safety | `store/PLAY_DATA_SAFETY.md` | Align to final AAB |
| Financial features | `store/PLAY_FINANCIAL_FEATURES.md` + `EU_CRYPTO_DECLARATION_OPTIONS_20261110.md` | Counsel for A/B/C |
| Country targeting | Matrix `PLAY_CRYPTO_COUNTRY_MATRIX_20261110.md` | Owner |
| Account deletion URL | `https://havkar.online/privacy-request.html` | Live request form (not instant delete) |
| Privacy / support | Canonical havkar.online URLs | Owner verify |

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

## Do not claim

- Closed testing duration completed
- MiCA license
- Production geo enforcement enabled
- Signed AAB for versionCode 3 built in this agent environment (SDK/keystore password missing locally)
