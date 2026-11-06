# iOS / App Store readiness (HAVKAR)

Checked on Linux Cloud Agent host. Xcode and Apple signing materials are not available here.

## Verified in repository

| Item | Status | Evidence |
| --- | --- | --- |
| iOS project | PASS | `ios/HAVKAR.xcodeproj` |
| Bundle id target | PASS (intended) | Store docs and Android id use `online.havkar.app`; confirm in Xcode before archive |
| App icon asset | PASS | `ios/HAVKAR/Assets.xcassets/AppIcon.appiconset` includes `AppIcon-1024.png` |
| Simulator / unsigned local path | PASS (documented) | Project historically builds for Simulator with signing off |

## Blocked in this environment

| Item | Status | Missing |
| --- | --- | --- |
| macOS | BLOCKED | Host is Linux |
| Xcode | BLOCKED | Not installed |
| Apple Developer team | BLOCKED | Not available to this agent |
| Distribution certificate / provisioning | BLOCKED | Not present |
| Signed IPA / TestFlight upload | BLOCKED | Cannot claim an IPA exists |

## Owner machine requirements

1. Mac with current Xcode.
2. Apple Developer Program membership for bundle id `online.havkar.app`.
3. App Store distribution certificate and App Store Connect provisioning profile.
4. Turn code signing on in Xcode, archive, upload to TestFlight.

## App Store Connect checklist (owner)

- App metadata / subtitle / keywords (from `store/LISTING.md`)
- Privacy Policy: `https://havkar-app.vercel.app/privacy.html`
- Support URL: `https://havkar-app.vercel.app/support.html`
- Privacy Nutrition Labels (aligned with Data safety draft)
- Real iPhone screenshots
- TestFlight internal/external testing
- Review notes can reuse `store/PLAY_APP_ACCESS.md` credentials instructions
