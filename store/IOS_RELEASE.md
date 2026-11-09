# iOS Release audit — GitHub Actions signed IPA path

Updated: **9 November 2026**  
Environment: Linux Cloud Agent (no local Xcode).  
No production payments enabled. No App Store public submission.  
**No signed IPA produced. No TestFlight upload dispatched.**

## Fix note — iOS Release run #6 (main)

Failed run: [Actions run 42552463533](https://github.com/havkarapp2026-cpu/havkar-app/actions/runs/42552463533) (exit code **65**)

```text
HAVKAR has conflicting provisioning settings.
HAVKAR is automatically signed for development, but a conflicting code signing
identity Apple Distribution has been manually specified.
```

Root cause: archive used `CODE_SIGN_STYLE=Automatic` together with
`CODE_SIGN_IDENTITY=Apple Distribution`.

**Remediation:** keep automatic signing + `DEVELOPMENT_TEAM` + ASC API auth;
clear `CODE_SIGN_IDENTITY` so Xcode chooses the Distribution identity during
archive/export. ExportOptions stays `signingStyle=automatic` with the same Team ID.
Temporary keychain import/cleanup unchanged. Secrets never printed.

## Fix note — iOS Release run #4 (main)

Failed run: [Actions run 42549487260](https://github.com/havkarapp2026-cpu/havkar-app/actions/runs/42549487260)  
Error: `Unable to resolve action apple-actions/import-codesigning-certs, repository not found`

Root cause: wrong action slug. The real maintained repo is `apple-actions/import-codesign-certs` (no “ing”). The misspelled name 404s at job setup.

**Remediation in repo:** removed the third-party cert-import action entirely. Signed IPA now imports the Distribution `.p12` (and optional `.mobileprovision`) with Apple’s `security` CLI via `scripts/ios-import-signing-materials.sh`, then deletes the temporary keychain in an `if: always()` cleanup step. Secret values are never echoed.

## Why Actions UI only showed “iOS Simulator build” (historical)

Verified with `gh workflow list` against the default branch (`main`):

| Workflow on `main` | Status |
| --- | --- |
| Android release AAB | active |
| Android upload keystore | active |
| Dependency audit | active |
| **iOS Simulator build** | active |
| pages-build-deployment | active |
| **iOS Release** | **absent on `main`** |

`ios-release.yml` exists on branch `cursor/ios-release-audit-d4b2` (PR #135) but **not** on `main`.

GitHub only registers `workflow_dispatch` workflows from the **default branch**. Dispatch proof:

```text
HTTP 404: workflow ios-release.yml not found on the default branch
```

**Exact blocker for visibility / manual Run workflow:** merge (or otherwise land) `.github/workflows/ios-release.yml` onto `main`. This agent does not merge without owner approval.

## Workflow implemented (this branch)

File: `.github/workflows/ios-release.yml`  
Name: **iOS Release**

| Mode | When | What it does |
| --- | --- | --- |
| `preflight` | default / also on PRs touching iOS paths | Repo checks + secret **presence** (true/false only). No signing. |
| `signed_ipa` | manual | macOS archive + export → IPA artifact |
| `testflight` | manual | signed IPA + TestFlight upload (not App Store review) |

Project reuse:

- `ios/HAVKAR.xcodeproj`
- Scheme `HAVKAR`
- Bundle ID `online.havkar.app`

Simulator CI (`.github/workflows/ios-simulator.yml`) stays unsigned.

## Apple signing configuration (verified in repo)

| Item | Current value | Notes |
| --- | --- | --- |
| `CODE_SIGNING_ALLOWED` | `NO` (Debug+Release in pbxproj) | Intentional for Simulator CI; Release job overrides to YES |
| `CODE_SIGNING_REQUIRED` | `NO` | Same |
| `CODE_SIGN_IDENTITY` | empty | CI sets `Apple Distribution` |
| `DEVELOPMENT_TEAM` | empty | CI sets from `APPLE_TEAM_ID` |
| `ProvisioningStyle` | **Automatic** | Updated for CI automatic signing |
| Entitlements file | absent | OK for current WKWebView shell |
| `.p12` / `.p8` / `.mobileprovision` / `.ipa` in git | **absent** (correct) | Never commit these |
| App icon | opaque RGB, PNG color_type **2** | App Store alpha issue fixed |
| ExportOptions | generated in CI; example at `ios/ExportOptions.plist.example` | Team ID from secret |

## Certificates / provisioning / ASC secrets

### Readable by this agent

| Check | Result |
| --- | --- |
| List repository Actions secrets via `gh` | **HTTP 403** — integration cannot enumerate secret inventory |
| Cursor app secrets for this workspace | none bound |
| Invent / fabricate Apple credentials | **forbidden / not done** |
| Certificate or profile files in workspace | **none found** |

### Secret presence from CI preflight (true/false only — values never logged)

From Actions run on this branch (`iOS Release` / Preflight job):

| Secret | Present |
| --- | --- |
| `APPLE_TEAM_ID` | **true** |
| `APPLE_DISTRIBUTION_CERTIFICATE_BASE64` | **true** |
| `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` | **false** ← required blocker for signed IPA |
| `APP_STORE_CONNECT_API_KEY_ID` | **true** |
| `APP_STORE_CONNECT_ISSUER_ID` | **true** |
| `APP_STORE_CONNECT_API_KEY` | **true** |
| `APPLE_PROVISIONING_PROFILE_BASE64` | false (optional) |

### Required GitHub Actions secrets (owner must set)

| Secret | Required for signed IPA | Purpose |
| --- | --- | --- |
| `APPLE_TEAM_ID` | yes | 10-char Team ID |
| `APPLE_DISTRIBUTION_CERTIFICATE_BASE64` | yes | Base64 Apple Distribution `.p12` |
| `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` | yes | `.p12` password |
| `APP_STORE_CONNECT_API_KEY_ID` | yes | ASC API Key ID |
| `APP_STORE_CONNECT_ISSUER_ID` | yes | ASC Issuer UUID |
| `APP_STORE_CONNECT_API_KEY` | yes | `.p8` PEM text or base64 |
| `APPLE_PROVISIONING_PROFILE_BASE64` | optional | Only if pinning a profile; automatic signing normally creates/updates profiles |

Encode helpers (run on a trusted machine; never commit output):

```bash
scripts/ios-encode-signing-secrets.sh certificate ./Distribution.p12
scripts/ios-encode-signing-secrets.sh api-key ./AuthKey_XXXXXX.p8
```

### ASC API key permissions required

- Role: **Admin** or **App Manager**
- Access to **Certificates, Identifiers & Profiles**
- Access to the HAVKAR app (Bundle ID `online.havkar.app`)

## Checks run (this audit)

| Check | Result |
| --- | --- |
| `scripts/ios-release-preflight.sh` | **PASS** |
| AppIcon alpha | **PASS** (color_type=2 / RGB) |
| Workflow YAML parse | **PASS** |
| `gh workflow list` (default branch) | iOS Release **missing** |
| `gh workflow run ios-release.yml` | **404** (not on default branch) |
| List Actions secrets | **403** (cannot verify presence) |
| Signed archive on macOS | **NOT RUN** (no Apple secrets available to agent; no Mac here) |
| TestFlight upload | **NOT RUN** (by design) |
| Production payments / live services | **unchanged** |

## Exact blockers (ordered)

1. **`ios-release.yml` not on `main`** → Actions UI cannot show / dispatch **iOS Release** from the default branch list.
2. **`APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` missing** (CI presence=`false`) → signed IPA / TestFlight modes will fail until set.
3. **App Store Connect app record / App ID** for `online.havkar.app` not verifiable from this environment.
4. (Non-blocking for IPA) Privacy Nutrition Labels / screenshots still owner-owned before public App Store release.

## Exact next actions for the owner

1. Review and **merge PR #135** (or land `.github/workflows/ios-release.yml` on `main`) so **iOS Release** appears under Actions.
2. Add repository secret **`APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD`** (password used when exporting the Distribution `.p12`). Do not paste it into chat/git.
3. In Actions → **iOS Release** → Run workflow → mode **`preflight`** (confirm all six required secrets = true).
4. Re-run with mode **`signed_ipa`** to produce the IPA artifact.
5. Only after IPA review: mode **`testflight`** (uploads to TestFlight; does **not** submit for public App Store review).

## Cost reminder

GitHub-hosted macOS (`macos-15`) ≈ **$0.062/minute** for private repos ([Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)).
