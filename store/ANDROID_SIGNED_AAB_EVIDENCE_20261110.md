# Signed Android AAB evidence — latest Closed Testing artifact

| Field | Value |
| --- | --- |
| Source commit | `8575252c1c3da29e848b07030c18cee9fbaa968b` |
| Tag | `havkar-android-signed-v101-202611110520` |
| CI run | https://github.com/havkarapp2026-cpu/havkar-app/actions/runs/42965500206 |
| Job | Build AAB (signed) — **success** |
| Package | `online.havkar.app` |
| versionCode / versionName | 3 / 1.0.1 |
| Artifact | `app-release.aab` (2686902 bytes) |
| Artifact id | `13830609010` (`havkar-app-release-signed-42965500206`) |
| SHA-256 | `ee69b57a899d405cd0fb05144d52a55fd3424138bddcc7e43ae4d3c31df8757d` |
| Signing verify | CI `jarsigner -strict` + fingerprint match **PASS** |
| Upload cert SHA-256 | `40:26:C5:0B:F4:A4:7E:20:38:78:F4:2C:A3:FA:9D:84:31:1B:31:D9:EF:CB:5F:A2:B5:12:95:0E:A6:64:00:8B` |
| Debuggable | No |
| Cleartext | `usesCleartextTraffic=false` |
| Permissions | `INTERNET` (+ app-private dynamic receiver permission) |
| Local Owner copy | `/opt/cursor/artifacts/play-closed-testing/online.havkar.app-v1.0.1-vc3-run42965500206.aab` |
| Closed testing pack | `store/PLAY_CLOSED_TESTING_RELEASE_20261110.md` |

Note: Binary SHA-256 matches the prior signed AAB from run `42886038671` because the Android native WebView shell bytes for versionCode 3 did not change; this run still rebuilt and re-verified signing from the latest tagged source commit.

Not uploaded to Play Console by the agent.
