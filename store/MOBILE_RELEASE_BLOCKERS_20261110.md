# Mobile release blockers — 10 November 2026

## Android

| Item | Status |
| --- | --- |
| Last successful signed AAB | GitHub Actions run `42425500153` (7 Nov 2026) |
| Branch version bump (this readiness branch) | `versionCode=3` / `versionName=1.0.1` in `android/app/build.gradle.kts` — new signed AAB not produced in this agent run |
| Dispatch from this agent | **403** — Owner must Run workflow **Android release AAB** → mode `signed` on an authorized branch/`main` |
| Play Console closed testing / production | Owner Console only |
| Fake testers | Not invented |

## iOS

| Item | Status |
| --- | --- |
| Latest signed IPA attempt | run `42554524860` **failed** |
| Error | `Cloud signing permission error` + `No profiles for 'online.havkar.app'` |
| TestFlight / App Store submit | Not done |
| Required Owner fix | Apple Developer: App Store Connect cloud signing permission + Distribution profile for `online.havkar.app` (prefer GitHub secret `APPLE_PROVISIONING_PROFILE_BASE64`), then re-run **iOS Release** mode `signed_ipa` |
| CI messaging | Export step now fails with explicit Owner actions when IPA is missing |
