# Android cloud release build (GitHub Actions)

Status: workflow ready. Signed Play AAB for `versionCode=3` / `versionName=1.0.1` was produced by CI run `42886038671` (tag `havkar-android-signed-v101-202611101930`). See `store/PLAY_CLOSED_TESTING_RELEASE_20261110.md`.

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

When the agent cannot call `workflow_dispatch` (GitHub App HTTP 403), a signed build can also be started by pushing an annotated tag matching `havkar-android-signed-*` (for example `havkar-android-signed-20261110`). Tag pushes always use **signed** mode.

## Required repository secrets (signed mode)

Add these under GitHub → Settings → Secrets and variables → Actions. Never commit them. Never paste them into chat or issues.

| Secret name | Contents |
| --- | --- |
| `HAVKAR_UPLOAD_KEYSTORE_BASE64` | Base64 of the `.jks` / `.keystore` upload key file |
| `HAVKAR_UPLOAD_STORE_PASSWORD` | Keystore password |
| `HAVKAR_UPLOAD_KEY_ALIAS` | Key alias |
| `HAVKAR_UPLOAD_KEY_PASSWORD` | Key password |

Gradle already reads the path/password/alias/password env vars from `android/app/build.gradle.kts`. The workflow decodes the base64 secret into a temp file with mode `600`, sets `HAVKAR_UPLOAD_STORE_FILE`, builds `:app:bundleRelease`, verifies signing with `scripts/verify-android-aab-signing.sh` (`jarsigner -verify -strict` against the upload keystore plus SHA-256 cert fingerprint match — plain `-strict` without the keystore falsely fails on expected self-signed Play upload certs), uploads the AAB artifact, then deletes the temp keystore.

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

## Create an upload keystore

If Play Console / GitHub already has a usable upload key for `online.havkar.app`, use that key. Do not generate a second one.

Preferred path when Termux `keytool` is unavailable (for example OpenJDK crashes on Android 16):

1. Read and approve `store/ANDROID_KEYSTORE_SECURITY.md`.
2. Create a backup identity on the tablet: native **age** (`age1...`) **or** passphrase-protected **SSH Ed25519** public key (`ssh-ed25519 AAAA...`).
3. Set secret `HAVKAR_UPLOAD_BACKUP_AGE_RECIPIENT` to that **public** line only (never the private key or passphrase).
4. After explicit owner approval, run workflow **Android upload keystore** with confirmation `CREATE_NEW_UPLOAD_KEY`.
5. Download the `.age` artifact, decrypt on the tablet with the matching private identity, set the four `HAVKAR_UPLOAD_*` secrets.
6. Build with **Android release AAB** → `signed`.

The generator refuses to run if any upload secret already exists, refuses private-key-shaped recipient values, and never uploads a plaintext keystore.

## Agent / CI limitations

- This agent cannot read existing Actions secret values (API 403).
- This agent will not invent or commit a keystore.
- Publishing to Play remains an explicit owner step.
