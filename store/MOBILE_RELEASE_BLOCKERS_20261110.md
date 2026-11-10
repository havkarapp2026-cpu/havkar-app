# Mobile release blockers — 10 November 2026

## Android

| Item | Status |
| --- | --- |
| Signed AAB for versionCode 3 | **PASS** — GitHub Actions run `42886038671` (tag `havkar-android-signed-v101-202611101930`, commit `ce2e5fd3`) |
| Package / versions | `online.havkar.app` · `versionCode=3` · `versionName=1.0.1` |
| jarsigner -strict vs upload key | **PASS** (CI + synthetic verifier suite) |
| SHA-256 | `ee69b57a899d405cd0fb05144d52a55fd3424138bddcc7e43ae4d3c31df8757d` |
| Closed testing pack | `store/PLAY_CLOSED_TESTING_RELEASE_20261110.md` |
| Play Console upload / closed rollout | **Owner Console only** — not done by agent |
| Fake testers | Not invented |
| Dispatch 403 workaround | Tag push `havkar-android-signed-*` works |

## iOS

| Item | Status |
| --- | --- |
| Latest signed IPA attempt | run `42554524860` **failed** |
| Error | `Cloud signing permission error` + `No profiles for 'online.havkar.app'` |
| TestFlight / App Store submit | Not done |
| Required Owner fix | Apple Developer: App Store Connect cloud signing permission + Distribution profile for `online.havkar.app` (prefer GitHub secret `APPLE_PROVISIONING_PROFILE_BASE64`), then re-run **iOS Release** mode `signed_ipa` |
| CI messaging | Export step now fails with explicit Owner actions when IPA is missing |
