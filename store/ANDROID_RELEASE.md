# Android release readiness (HAVKAR)

Checked on Linux Cloud Agent host (no macOS). Package id and Gradle signing are in-repo. A signed AAB was **not** produced for Play upload in this environment.

## Verified in repository

| Item | Status | Evidence |
| --- | --- | --- |
| Package / applicationId | PASS | `online.havkar.app` in `android/app/build.gradle.kts` |
| versionCode / versionName | PASS | `1` / `1.0.0-beta` |
| Internet permission | PASS | `INTERNET` only in `AndroidManifest.xml` |
| Upload signing config | PASS (code) | Reads `HAVKAR_UPLOAD_STORE_FILE`, `HAVKAR_UPLOAD_STORE_PASSWORD`, `HAVKAR_UPLOAD_KEY_ALIAS`, `HAVKAR_UPLOAD_KEY_PASSWORD` |
| Launcher icons | PASS | `mipmap-*/ic_launcher.png` present |
| Capacitor / WebView shell | PASS | Android project present under `android/` |
| Cloud unsigned AAB workflow | PASS (CI) | `.github/workflows/android-release-aab.yml` — successful run `42292911126` |
| Cloud signed AAB | BLOCKED | Requires repository secrets `HAVKAR_UPLOAD_*` |
| Age-encrypted keystore generator | READY (gated) | `store/ANDROID_KEYSTORE_SECURITY.md` + workflow; run `42307300847` stopped because `HAVKAR_UPLOAD_BACKUP_AGE_RECIPIENT` was missing — correct fail-closed behavior |

## Blocked without owner secrets

| Item | Status | Missing |
| --- | --- | --- |
| Upload keystore material | BLOCKED | Owner must supply or approve generation via age recipient secret |
| Signed release AAB for Play | BLOCKED | Cannot invent signing credentials |
| Play Console closed testing upload | BLOCKED | Needs signed AAB + owner Console access |

## Build command (owner machine)

When the four `HAVKAR_UPLOAD_*` values and Android SDK are available:

```
cd android
./gradlew :app:bundleRelease
```

Output path (standard Gradle):

```
android/app/build/outputs/bundle/release/app-release.aab
```

Do not generate an upload keystore inside the repository.

## Google Play Console checklist (owner)

- Store listing (short/full description from `store/LISTING.md`)
- Privacy Policy URL: `https://havkar-app.vercel.app/privacy.html`
- Support URL: `https://havkar-app.vercel.app/support.html`
- Data safety (draft notes in `store/LISTING.md` — counsel review)
- Content rating / IARC
- Target audience
- Advertising declaration (no ads SDK in the Android manifest)
- Account deletion URL: `https://havkar-app.vercel.app/privacy-request.html`
- Real phone screenshots (Home, Buy & Sell 2-col, Explore 3-col, Support, Login)
- Closed testing track + testers
- App Access: `store/PLAY_APP_ACCESS.md`
