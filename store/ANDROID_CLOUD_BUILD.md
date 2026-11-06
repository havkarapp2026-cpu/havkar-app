# Android cloud release build (GitHub Actions)

Status: workflow ready. A signed Play AAB is produced only after the owner adds upload-key secrets and runs **Android release AAB** in `signed` mode.

This does **not** publish to Google Play. Live payments stay off.

## Why GitHub Actions

The owner works from a Samsung Android tablet. Building locally needs an Android SDK machine. The safest practical path already used by this repo for iOS is `workflow_dispatch` on GitHub-hosted runners.

Existing workflows reused for pattern only:

- `.github/workflows/ios-simulator.yml` — manual dispatch, no store publish
- `.github/workflows/dependency-audit.yml` — Node audit on `ubuntu-latest`

New workflow:

- `.github/workflows/android-release-aab.yml`

## Modes

| Mode | Purpose | Play upload |
| --- | --- | --- |
| `unsigned_smoke` | Prove SDK + Gradle produce an AAB | No — not for Play |
| `signed` | Produce a Play upload-signed AAB | Artifact only — owner uploads later |

Pull requests that touch `android/**` or this workflow run **`unsigned_smoke` only**. Signed builds are manual (`workflow_dispatch`) after secrets exist on the default branch.

## Required repository secrets (signed mode)

Add these under GitHub → Settings → Secrets and variables → Actions. Never commit them. Never paste them into chat or issues.

| Secret name | Contents |
| --- | --- |
| `HAVKAR_UPLOAD_KEYSTORE_BASE64` | Base64 of the `.jks` / `.keystore` upload key file |
| `HAVKAR_UPLOAD_STORE_PASSWORD` | Keystore password |
| `HAVKAR_UPLOAD_KEY_ALIAS` | Key alias |
| `HAVKAR_UPLOAD_KEY_PASSWORD` | Key password |

Gradle already reads the path/password/alias/password env vars from `android/app/build.gradle.kts`. The workflow decodes the base64 secret into a temp file with mode `600`, sets `HAVKAR_UPLOAD_STORE_FILE`, builds `:app:bundleRelease`, verifies with `jarsigner`, uploads the AAB artifact, then deletes the temp keystore.

Do **not** create a debug keystore for Play. Do **not** commit any keystore.

## Run from a tablet browser

1. Open the Actions workflow page (after this workflow is on `main` or the PR branch):

```
https://github.com/havkarapp2026-cpu/havkar-app/actions/workflows/android-release-aab.yml
```

2. Tap **Run workflow**.
3. Choose branch (`main` after merge, or the PR branch for a test).
4. Mode: `unsigned_smoke` first (optional), then `signed` after secrets exist.
5. When green, open the run → Artifacts → download `havkar-app-release-signed-<run_id>`.
6. Upload that AAB in Play Console Closed testing only when the owner approves publish.

## Create an upload keystore on a Samsung tablet (Termux)

Only if you do **not** already have a Play upload key. Keep the file and passwords offline (password manager). Do not email them.

1. Install **Termux** from a trusted source (F-Droid recommended).
2. In Termux:

```
pkg update
pkg install openjdk-17
keytool -genkeypair -v -keystore havkar-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias havkar-upload
```

3. Answer the prompts. Remember store password, key password, and alias `havkar-upload` (or the alias you typed).
4. Encode for the GitHub secret (still in Termux):

```
base64 -w 0 havkar-upload.jks > havkar-upload.b64
```

5. Copy the `.b64` text into GitHub secret `HAVKAR_UPLOAD_KEYSTORE_BASE64` using the tablet browser.
6. Store the three password/alias secrets the same way.
7. Keep `havkar-upload.jks` backed up offline. Losing it blocks updates unless Play App Signing recovery applies.

If Play Console already issued an upload key for `online.havkar.app`, use that key instead of generating a new one.

## Agent / CI limitations

- This agent cannot read existing Actions secret values (API 403).
- This agent will not invent or commit a keystore.
- Publishing to Play remains an explicit owner step.
