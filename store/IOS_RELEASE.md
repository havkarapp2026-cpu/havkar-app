# iOS / App Store readiness audit — 8 November 2026

Environment of this check: **Linux Cloud Agent** (no Xcode).  
No production payments enabled. No migrations deployed. No live services modified.  
**No signed IPA or TestFlight upload was produced or claimed.**

## Repository project (verified)

| Item | Value / status | Evidence |
| --- | --- | --- |
| Project | `ios/HAVKAR.xcodeproj` | Present |
| Scheme | `HAVKAR` (Archive → Release) | `ios/HAVKAR.xcodeproj/xcshareddata/xcschemes/HAVKAR.xcscheme` |
| App type | UIKit + WKWebView shell | `HAVKARApp.swift`, `HavkarWebView.swift` |
| Start URL | `https://havkar-app.vercel.app/` | `HavkarLinks.swift` |
| Bundle ID | `online.havkar.app` | `PRODUCT_BUNDLE_IDENTIFIER` in `project.pbxproj` |
| Display name | HAVKAR | `Info.plist` / build settings |
| Marketing version | `1.0.0` | `MARKETING_VERSION` |
| Build number | `1` | `CURRENT_PROJECT_VERSION` |
| Deployment target | iOS **16.0** | `IPHONEOS_DEPLOYMENT_TARGET` |
| Devices | iPhone + iPad (`1,2`) | `TARGETED_DEVICE_FAMILY` |
| Encryption export | `ITSAppUsesNonExemptEncryption = false` | `Info.plist` |
| Privacy manifest | Present (empty access/types arrays) | `PrivacyInfo.xcprivacy` |
| App icon asset | `AppIcon-1024.png` 1024×1024 | Assets catalog |
| Unit tests | Host allowlist tests | `HAVKARTests/HavkarLinksTests.swift` |
| CI simulator | Unsigned Debug simulator build/test | `.github/workflows/ios-simulator.yml` |
| Last CI success | Run `40207894944` on `main` (simulator only) | GitHub Actions |

## Signing / distribution configuration (verified blockers)

| Setting | Current value | Impact |
| --- | --- | --- |
| `CODE_SIGNING_ALLOWED` | **NO** (Debug + Release) | Cannot produce App Store / device signed build |
| `CODE_SIGNING_REQUIRED` | **NO** | Same |
| `CODE_SIGN_IDENTITY` | empty | No Apple Distribution identity selected |
| `DEVELOPMENT_TEAM` | empty | No Team ID bound |
| `ProvisioningStyle` | **Manual** | Needs explicit provisioning profile |
| Entitlements file | **Missing** | OK for basic WKWebView; no Push/Associated Domains configured |
| ExportOptions.plist | **Missing** | Needed for CLI/archive export automation |
| `.mobileprovision` / `.p12` / certificates in repo | **Absent** (correct — secrets must not be committed) | Signing must happen on owner Mac / CI secrets |
| Signed `.ipa` / `.xcarchive` in workspace | **Absent** | No upload artifact exists |

## App Store Connect compatibility notes

Compatible targets from the project file:

- Bundle ID candidate: `online.havkar.app`
- Version `1.0.0` (1)
- iOS 16+
- Privacy Policy / Support URLs already used elsewhere:  
  `https://havkar-app.vercel.app/privacy.html`  
  `https://havkar-app.vercel.app/support.html`

Owner still must create/confirm the App Store Connect app record, screenshots, age rating, and Privacy Nutrition Labels. This agent cannot verify Connect console state.

## Additional App Store risk found in repo

| Risk | Detail |
| --- | --- |
| App icon has alpha channel | `AppIcon-1024.png` is PNG color type **6 (RGBA)**. App Store rejects icons with transparency. Flatten to opaque RGB before Archive upload. |
| Privacy manifest empty | `NSPrivacyAccessedAPITypes` / collected data arrays are empty. Owner must align Nutrition Labels and any Required Reason APIs with real behavior (WKWebView may use UserDefaults). |
| Signing intentionally off | Matches CI simulator path; Release config is also unsigned — Archive for TestFlight will fail until signing is turned on with a real team. |

## What is NOT blocking (in repo)

- Presence of an iOS Xcode project and scheme
- Bundle ID string consistency (`online.havkar.app`)
- Basic privacy encryption key in Info.plist
- Simulator CI path (unsigned) historically green

## Exact blockers for a real signed build + TestFlight upload

1. **No macOS/Xcode on this agent** — cannot run `xcodebuild archive` here.
2. **Release signing disabled** in `project.pbxproj` (`CODE_SIGNING_ALLOWED=NO`, empty `DEVELOPMENT_TEAM`).
3. **No Apple Developer Team / Distribution certificate / App Store provisioning profile** available to the agent.
4. **No IPA artifact** exists to upload.
5. **App icon alpha** must be removed before a successful App Store validation.
6. **App Store Connect app + metadata** not verifiable from this environment.

## Exact next action required from the owner

On a Mac with Xcode and an active Apple Developer Program membership for HAVKAR:

1. Open `ios/HAVKAR.xcodeproj`.
2. Replace/export `AppIcon-1024.png` as **opaque RGB** (no transparency).
3. In Signing & Capabilities: set Team, enable “Automatically manage signing” (or attach App Store profile), Bundle ID `online.havkar.app`.
4. In Apple Developer / App Store Connect: ensure App ID + app record exist for `online.havkar.app`.
5. Product → Archive (Release) → Distribute App → App Store Connect → TestFlight.
6. Only then claim a signed build/upload with the resulting build number from Connect.

Until those owner steps succeed, TestFlight status remains: **NOT UPLOADED**.
