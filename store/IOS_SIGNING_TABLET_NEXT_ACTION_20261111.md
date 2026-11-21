# iOS signing — exact next Owner action (Samsung tablet)

Date: 2026-11-11  
Team ID: `8Z7428QR4L`  
Bundle ID: `online.havkar.app`  
Profile name: `HAVKAR App Store Distribution`

## Verified from GitHub Actions (no secret values printed)

Failed IPA run `42554524860` (Signed IPA job):

| Check | Result |
| --- | --- |
| Decode `APPLE_DISTRIBUTION_CERTIFICATE_BASE64` | `Decoded Distribution certificate bytes=3259` |
| Import as PKCS#12 (`security import … -f pkcs12`) | **Succeeded** |
| Codesigning identities in temp keychain | **1** |
| Log line | `Imported Apple Distribution certificate into temporary keychain` |
| `APPLE_PROVISIONING_PROFILE_BASE64` | empty → automatic export → exit **70** |

Conclusion:

- Existing Distribution secret is already a usable **PKCS#12 (`.p12`) with matching private key**.  
  A bare `.cer` cannot produce a codesigning identity after `security import -f pkcs12`.
- Password secret already unlocks that `.p12`.
- **Do not recreate** the Apple Distribution certificate, private key, or App Store profile.
- All archive/export/TestFlight signing for HAVKAR is designed for **GitHub-hosted `macos-15` runners**. A local Mac is **not** required for the next step.

## Workflow already accepts the profile via GitHub Secrets

`.github/workflows/ios-release.yml` + `scripts/ios-import-signing-materials.sh`:

1. Reads `APPLE_PROVISIONING_PROFILE_BASE64`
2. Base64-decodes it on the runner (temp file only; not committed)
3. Installs it under `~/Library/MobileDevice/Provisioning Profiles/`
4. Switches export to **manual** when a profile UUID is present

Secret size: typical `.mobileprovision` is a few KB (GitHub secret limit 64 KB) — safe.

## Exact next action (Samsung Android tablet only)

**Only missing asset:** put the existing App Store `.mobileprovision` into GitHub Actions secret `APPLE_PROVISIONING_PROFILE_BASE64`.

1. On the tablet, locate the downloaded profile file  
   (name like `HAVKAR_App_Store_Distribution.mobileprovision` or similar).
2. Create a **single-line base64** of that file (do **not** paste into chat or commit to git).

   If Termux (or any local terminal) is available:

   ```bash
   base64 -w 0 "/path/to/HAVKAR_App_Store_Distribution.mobileprovision"
   ```

   Then copy the printed line.

3. In mobile browser open the repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - Name exactly:

     ```
     APPLE_PROVISIONING_PROFILE_BASE64
     ```

   - Value: paste the single-line base64 only.
4. Leave these secrets unchanged (already proven working):
   - `APPLE_DISTRIBUTION_CERTIFICATE_BASE64`
   - `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD`
   - `APPLE_TEAM_ID`
   - App Store Connect API key trio
5. Reply that the profile secret is saved. Agent will then run **signed_ipa** on GitHub `macos-15` and prepare TestFlight **without** App Store submit.

## Do not

- Recreate certificates / profiles / private keys
- Upload `.p12` / `.mobileprovision` / passwords into chat or git
- Use random online “base64 websites” if you can encode locally
- Publish / submit the app yet
