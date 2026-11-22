# iOS signing assets — missing items and safest Owner action

Date: 2026-11-11  
Team ID (stated by Owner): `8Z7428QR4L`  
Bundle ID: `online.havkar.app`  
Profile name (Owner-created): `HAVKAR App Store Distribution` (expires 2027-11-09)

**No private keys, passwords, certificates, or profiles were requested or printed.**

## Exact cause of previous IPA failure (exit 70)

Failed run: https://github.com/havkarapp2026-cpu/havkar-app/actions/runs/42554524860

Archive **succeeded**. Export failed with:

```text
error: exportArchive Cloud signing permission error
error: exportArchive No profiles for 'online.havkar.app' were found
** EXPORT FAILED **
exit code 70
```

Root cause (technical):

1. Export used `signingStyle=automatic` / App Store Connect cloud signing.
2. ASC API key did **not** have permission (or ability) to create/fetch Distribution profiles for `online.havkar.app`.
3. GitHub secret `APPLE_PROVISIONING_PROFILE_BASE64` was **not** installed, so CI could not switch to **manual** export with a local `.mobileprovision`.

Certificate import into the temporary keychain **did succeed** in that run (Distribution identity was available for archive). The blocker was **profile availability at export**, not archive compile.

## What CI needs (names only)

| Asset / secret | Purpose | Status for next IPA |
| --- | --- | --- |
| `APPLE_TEAM_ID` | Team `8Z7428QR4L` | Must match Owner team |
| `APPLE_DISTRIBUTION_CERTIFICATE_BASE64` | Base64 of **`.p12`** (cert **+ private key**) | Required |
| `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` | Password of that `.p12` | Required |
| `APPLE_PROVISIONING_PROFILE_BASE64` | Base64 of App Store `.mobileprovision` | **Required for safe path** (manual export) |
| `APP_STORE_CONNECT_API_KEY_ID` / `ISSUER_ID` / `API_KEY` | ASC auth / TestFlight later | Prefer keep for upload |

## Current GitHub Actions secret presence (true/false only)

From preflight artifact on 2026-11-11 (run `42965959871`):

| Secret | Present |
| --- | --- |
| `APPLE_TEAM_ID` | true |
| `APPLE_DISTRIBUTION_CERTIFICATE_BASE64` | true |
| `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` | true |
| `APP_STORE_CONNECT_API_KEY_ID` | true |
| `APP_STORE_CONNECT_ISSUER_ID` | true |
| `APP_STORE_CONNECT_API_KEY` | true |
| `APPLE_PROVISIONING_PROFILE_BASE64` | **false** ← blocker for manual export |

## Missing / not yet in the macOS CI environment

Confirmed from Owner message + CI:

1. **App Store Distribution provisioning profile is on the Android tablet**, not in GitHub Actions secrets → CI cannot see it (`APPLE_PROVISIONING_PROFILE_BASE64=false`).
2. A downloaded **`.cer` is certificate-only**. It does **not** include the private key. CI import requires a **`.p12`** that already pairs the Distribution cert with its private key.
3. No `.p12`, `.mobileprovision`, `.cer`, or `.p8` files exist in the git worktree (correct).

This agent **cannot** verify whether the existing GitHub secret `APPLE_DISTRIBUTION_CERTIFICATE_BASE64` is a valid `.p12` with matching private key (secret values are unreadable). Only Owner can confirm that on a trusted machine. Prior failed IPA did import one codesigning identity successfully, which is a positive signal that a `.p12` was previously usable — still keep the `.p12` (not `.cer`) rule.

## Safest next Owner action (do this first)

Do **not** recreate the Apple Distribution certificate or the App Store profile unless the private key is truly lost.

1. On a trusted computer that has (or can receive) the **same private key** used when the Distribution certificate was created:
   - Export / obtain Apple Distribution as **`.p12`** (cert + private key), password-protected.
   - Never paste the password, `.p12`, or base64 into chat/git.
2. Move the downloaded profile `HAVKAR App Store Distribution` (`.mobileprovision`) from the Android tablet to that trusted computer (USB/secure transfer). Do not commit it.
3. Encode **only on that trusted computer** (helpers already in repo):

```bash
# Distribution identity MUST be .p12 (not .cer)
scripts/ios-encode-signing-secrets.sh certificate ./HAVKAR_Distribution.p12
```

```bash
# Profile (base64 one line; same helper accepts any file)
base64 -w 0 ./HAVKAR_App_Store_Distribution.mobileprovision; echo
```

4. In GitHub → Settings → Secrets and variables → Actions, set/update **without** posting values here:
   - `APPLE_TEAM_ID` = `8Z7428QR4L`
   - `APPLE_DISTRIBUTION_CERTIFICATE_BASE64` = output of certificate encode (`.p12`)
   - `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` = `.p12` password
   - `APPLE_PROVISIONING_PROFILE_BASE64` = profile base64  
5. Tell the agent secrets are updated (presence only). Then re-run **iOS Release** mode `signed_ipa` (or tag `havkar-ios-signed-*`).

Until step 4 completes, IPA export will remain blocked even though the profile exists on the tablet.

## Explicit non-actions

- No IPA built in this turn (assets not yet in CI).
- No TestFlight upload / App Store submit.
- No merge / deploy / payment activation.
- No request for private keys or passwords in chat.
