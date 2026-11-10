# Mobile release blockers — 10 November 2026

## Android

| Item | Status |
| --- | --- |
| Last successful signed AAB | GitHub Actions run `42425500153` (7 Nov 2026) |
| Dispatch from this agent | **403** — Owner must Run workflow **Android release AAB** → mode `signed` on `main` |
| Play Console closed testing / production | Owner Console only |
| Fake testers | Not invented |

## iOS

| Item | Status |
| --- | --- |
| Latest signed IPA attempt | run `42554524860` **failed** |
| Error | `Cloud signing permission error` + `No profiles for 'online.havkar.app'` |
| TestFlight / App Store submit | Not done |
| Required Owner fix | Apple Developer: App Store Connect cloud signing permission + Distribution profile for `online.havkar.app`, then re-run **iOS Release** mode `signed_ipa` |
