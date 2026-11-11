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
| Latest signed IPA attempt | run `42554524860` **failed** (exit **70**) |
| Exact export errors | `Cloud signing permission error` + `No profiles for 'online.havkar.app'` |
| Root cause | Automatic/cloud export without local App Store `.mobileprovision` in CI |
| Profile created by Owner | `HAVKAR App Store Distribution` (expires 2027-11-09) — currently on Android tablet, **not** in CI secrets |
| Distribution `.p12` in CI | **Valid** — run `42554524860` imported PKCS#12 and found **1** codesigning identity |
| Missing for next IPA | Only GitHub secret `APPLE_PROVISIONING_PROFILE_BASE64` (from tablet `.mobileprovision`) |
| Local Mac required for next step? | **No** — GitHub-hosted `macos-15` runners handle signing |
| TestFlight / App Store submit | Not done |
| Owner guide | `store/IOS_SIGNING_TABLET_NEXT_ACTION_20261111.md` |
