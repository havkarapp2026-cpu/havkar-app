# Android release readiness (HAVKAR)

Checked on Linux Cloud Agent host (no macOS). Package id and Gradle signing are in-repo. Cloud signed AAB CI succeeded for the previous upload key; API 36 + versionCode 2 need a fresh signed run after merge.

## Verified in repository

| Item | Status | Evidence |
| --- | --- | --- |
| Package / applicationId | PASS | `online.havkar.app` in `android/app/build.gradle.kts` |
| versionCode / versionName | PASS | `2` / `1.0.0` (API 36 branch) |
| Internet permission | PASS | `INTERNET` only in `AndroidManifest.xml` |
| Upload signing config | PASS (code) | Reads `HAVKAR_UPLOAD_STORE_FILE`, `HAVKAR_UPLOAD_STORE_PASSWORD`, `HAVKAR_UPLOAD_KEY_ALIAS`, `HAVKAR_UPLOAD_KEY_PASSWORD` |
| targetSdk / compileSdk | PASS (branch) | API **36** |
| Signed cloud AAB | PASS (CI) | Run `42399945850` on main verified jarsigner against upload keystore |
| Launcher icons | PASS | `mipmap-*/ic_launcher.png` present |
| Capacitor / WebView shell | PASS | Android project present under `android/` |
| Cloud unsigned AAB workflow | PASS (CI) | `.github/workflows/android-release-aab.yml` — successful run `42292911126` |
| Cloud signed AAB | PASS | Secrets present; signed artifact produced on run `42399945850` |
| Age-encrypted keystore generator | PASS (completed) | Do not regenerate the existing upload key without verified necessity |

## Remaining owner Console steps

| Item | Status | Missing |
| --- | --- | --- |
| Upload keystore / GitHub secrets | PASS | Present for signed CI AAB (do not regenerate without necessity) |
| Re-run signed AAB after API 36 bump | PENDING | Owner or CI on this branch |
| Play Console closed testing upload | BLOCKED | Owner Console upload + metadata |

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
