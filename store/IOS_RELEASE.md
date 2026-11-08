# iOS / App Store readiness — GitHub Actions macOS path

Updated: **8 November 2026**  
Environment of this check: **Linux Cloud Agent** (no local Xcode).  
No production payments enabled. No live services modified.  
**No signed IPA or TestFlight upload was dispatched from this agent.**

## Goal

Build and (optionally later) upload HAVKAR iOS using **GitHub-hosted `macos-15` runners**, without requiring the owner to buy a Mac. Reuses:

| Item | Value |
| --- | --- |
| Project | `ios/HAVKAR.xcodeproj` |
| Scheme | `HAVKAR` |
| Bundle ID | `online.havkar.app` |
| Marketing version / build | `1.0.0` / `1` |
| Deployment target | iOS 16.0 |

## What was fixed / prepared in-repo

| Change | Status |
| --- | --- |
| App Store icon alpha | **Fixed** — `AppIcon-1024.png` is opaque **RGB** (`PIL mode=RGB`, PNG color type 2). Workflow also re-checks before archive. |
| Signed release workflow | **Prepared** — `.github/workflows/ios-release.yml` (`workflow_dispatch` only). |
| Export options example | `ios/ExportOptions.plist.example` (Team ID filled at CI runtime). |
| Secret encoder helper | `scripts/ios-encode-signing-secrets.sh` (run locally; never commit output). |
| Simulator CI | Unchanged — `.github/workflows/ios-simulator.yml` stays unsigned. |
| Project signing defaults | Still `CODE_SIGNING_ALLOWED=NO` in `project.pbxproj` for Simulator CI. Release job **overrides** signing via `xcodebuild` flags only. |
| Certificates / keys / profiles in git | **Absent** (correct). |

## Workflows

| Workflow | Runner | Trigger | Purpose |
| --- | --- | --- | --- |
| `iOS Simulator build` | `macos-15` | push to `ios/**` + manual | Unsigned Debug simulator build/test |
| `iOS Release` | `macos-15` | **manual only** | Signed Archive → IPA artifact; optional TestFlight if input enabled |

`iOS Release` inputs:

- `upload_to_testflight` — default **`false`**
- `skip_if_secrets_missing` — default **`true`** (exits green without building when secrets absent)

## Exact GitHub Actions secrets required

Add these under **Repo → Settings → Secrets and variables → Actions**. Never commit them.

| Secret name | What it is | How the owner creates it |
| --- | --- | --- |
| `APPLE_TEAM_ID` | 10-character Apple Team ID | Apple Developer → Membership details, or Xcode Team |
| `APPLE_DISTRIBUTION_CERTIFICATE_BASE64` | Base64 of Apple **Distribution** `.p12` | Create/export Distribution cert (see below), then `scripts/ios-encode-signing-secrets.sh certificate ./dist.p12` |
| `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` | Password used when exporting that `.p12` | Chosen at export time |
| `APP_STORE_CONNECT_API_KEY_ID` | Key ID (e.g. `AB12CD34EF`) | App Store Connect → Users and Access → Integrations → Team Keys |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer UUID | Same Integrations page (Issuer ID) |
| `APP_STORE_CONNECT_API_KEY` | Contents of `AuthKey_<KEY_ID>.p8` (raw PEM **or** base64 of the file) | Download once when creating the API key; store offline |

Optional (not required for automatic signing path):

| Secret | When needed |
| --- | --- |
| `APPLE_PROVISIONING_PROFILE_BASE64` | Only if switching the workflow to **manual** signing / pinned profile |

## Exact Apple credentials, certificates, and permissions

### 1. Apple Developer Program

- Active **Apple Developer Program** membership (paid organization or individual) for HAVKAR.
- Access to [developer.apple.com](https://developer.apple.com) and [appstoreconnect.apple.com](https://appstoreconnect.apple.com).

### 2. App ID / Bundle ID

- Register (or confirm) App ID **`online.havkar.app`** under Certificates, Identifiers & Profiles → Identifiers.
- Capabilities: keep minimal for current WKWebView shell (no Push / Associated Domains required by current entitlements file — none is checked in).

### 3. App Store Connect app record

- Create or confirm an iOS app with Bundle ID `online.havkar.app`.
- Fill required metadata before a public App Store release (screenshots, privacy nutrition labels, support URL, privacy URL). Suggested URLs already used elsewhere:
  - `https://havkar-app.vercel.app/privacy.html`
  - `https://havkar-app.vercel.app/support.html`
- TestFlight upload does **not** require full public listing metadata, but the app record must exist.

### 4. Apple Distribution certificate (`.p12`)

Needed because GitHub macOS runners do not share your local Keychain.

Owner actions (on any Mac you can borrow once, or via Developer portal + openssl tooling you trust):

1. In Certificates, Identifiers & Profiles → Certificates → create **Apple Distribution** (or reuse an existing valid one for the team).
2. Export the cert + private key as a `.p12` with a strong password.
3. Encode and store only in GitHub secrets (never in git):
   - `APPLE_DISTRIBUTION_CERTIFICATE_BASE64`
   - `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD`

If you do not have a Mac for CSR/export: use Apple’s portal with a CSR generated on a trusted machine (including CI bootstrap machines you control). Do not paste private keys into chat.

### 5. App Store Connect API key (for automatic provisioning + optional upload)

Create under **App Store Connect → Users and Access → Integrations → Team Keys**:

| Field | Requirement |
| --- | --- |
| Access | Prefer **Admin** or **App Manager** |
| Certificates, Identifiers & Profiles | Must be allowed for the key/role so `xcodebuild -allowProvisioningUpdates` can create/update App Store profiles |
| Apps access | Include the HAVKAR app (or All Apps) |
| Download | `.p8` is shown **once** — save offline |

Map to secrets:

- Key ID → `APP_STORE_CONNECT_API_KEY_ID`
- Issuer ID → `APP_STORE_CONNECT_ISSUER_ID`
- `.p8` body → `APP_STORE_CONNECT_API_KEY`

### 6. Automatic signing behavior in CI

The Release workflow does **not** rewrite `project.pbxproj`. It overrides at archive time:

- `CODE_SIGN_STYLE=Automatic`
- `CODE_SIGNING_ALLOWED=YES` / `CODE_SIGNING_REQUIRED=YES`
- `CODE_SIGN_IDENTITY=Apple Distribution`
- `DEVELOPMENT_TEAM=$APPLE_TEAM_ID`
- `-allowProvisioningUpdates` + ASC API key auth flags

So Simulator CI remains unsigned; Release CI signs only when secrets exist.

## Owner action checklist (ordered)

1. Confirm Apple Developer membership + Team ID → set `APPLE_TEAM_ID`.
2. Confirm App ID `online.havkar.app` + App Store Connect app record.
3. Create/export Apple Distribution `.p12` → set certificate secrets.
4. Create ASC API key with App Manager/Admin + CIP access → set API key secrets.
5. (Optional) Run Actions → **iOS Release** with `upload_to_testflight=false` to produce an IPA artifact only.
6. Only after reviewing the IPA: re-run with `upload_to_testflight=true` for TestFlight.
7. Complete App Store Connect compliance (privacy labels, age rating, screenshots) before App Store submission.

**This agent has not performed steps 5–6.**

## GitHub Actions macOS costs (verified from GitHub docs)

Source: [Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)

| Runner | Label used | Per-minute rate (USD, private repos) |
| --- | --- | --- |
| macOS 3-core (M1) / 4-core Intel | `macos-15` / `actions_macos` SKU | **$0.062 / minute** |
| Larger macOS 12-core | `macos_l` | $0.077 / minute (Team/Enterprise larger runners) |

Notes:

- Minutes are rounded up per job.
- Public repos: standard GitHub-hosted runners remain free for public repositories per GitHub’s public-repo policy; private repos draw from included Actions minutes then bill overage.
- Rough estimate for one signed archive+export on `macos-15`: often **~15–45 minutes** wall time → about **$0.93–$2.80** per run at $0.062/min (machine-dependent; first cold run can be longer).
- Simulator CI on every `ios/**` push also consumes macOS minutes at the same rate.
- Owner should watch **Billing → Actions** after the first manual Release run.

Buying a Mac is **not** required for CI archive/upload if secrets + ASC access are configured. A one-time Mac (or trusted CSR machine) is still typically needed to create/export the Distribution certificate private key unless the team already has a `.p12`.

## Remaining App Store risks (not fixed by CI alone)

| Risk | Detail |
| --- | --- |
| Privacy manifest empty | `PrivacyInfo.xcprivacy` arrays are empty; align Nutrition Labels / Required Reason APIs with real WKWebView behavior. |
| ASC metadata | Screenshots, age rating, review notes still owner-owned. |
| Payments | Production payment flags remain off; do not enable for store review unless intentionally ready. |

## Status summary

| Claim | Status |
| --- | --- |
| Icon alpha fixed in repo | **Yes** |
| Secure Release workflow prepared | **Yes** (`workflow_dispatch`, secrets-only signing) |
| Certs/keys/profiles committed | **No** |
| Signed build / TestFlight triggered by this agent | **No** |
| Production payments / live services changed | **No** |
| TestFlight uploaded | **NOT UPLOADED** |
