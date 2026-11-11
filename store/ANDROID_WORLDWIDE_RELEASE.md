# Android worldwide release preparation (8 November 2026)

Preparation for Play Console distribution in all eligible countries.  
**Does not claim Google Play production access.** Google grants production; the 12-tester / 14-day closed-testing rule is not bypassed.

## Verified in repository / CI

| Item | Status | Evidence |
| --- | --- | --- |
| Package | PASS | `online.havkar.app` |
| versionCode / versionName | PASS | `2` / `1.0.0` |
| targetSdk / compileSdk | PASS | API 36 |
| Permissions | PASS | `INTERNET` only |
| Signed AAB CI | PASS (historical) | workflow `android-release-aab.yml` success on `main` (e.g. run `42425500153`) |
| Data safety draft | PASS (repo) | `store/PLAY_DATA_SAFETY.md` |
| Listing draft | PASS (repo) | `store/LISTING.md` |
| App Access draft | PASS (repo) | `store/PLAY_APP_ACCESS.md` |

## Closed testing (mandatory before production)

| Requirement | Status | Owner action |
| --- | --- | --- |
| Upload signed AAB to **Closed testing** | BLOCKED | Play Console upload |
| Recruit **≥ 12 testers** | BLOCKED | Owner invites testers |
| Keep closed testing active **≥ 14 days** | BLOCKED | Calendar wait; do not claim production early |
| Countries / worldwide availability | BLOCKED | Play Console → Countries/regions (eligible only) |
| Data safety / IARC / screenshots | BLOCKED | Paste from store drafts after counsel review |
| Production track promote | BLOCKED | Only after Google eligibility + closed-testing rules |

## Device QA checklist (owner / closed testers)

1. Fresh install from closed testing track
2. Login (email/password reviewer account + Google optional)
3. Home / Explore / Buy & Sell columns render
4. Profile → Business Account loads without crash
5. Ads create gated by approved business (expected)
6. No real-money charge while payment flags remain paused
7. Privacy / support / account-deletion URLs open

## Explicit non-claims

- Worldwide production availability: **NOT GRANTED by this document**
- 12/14-day bypass: **FORBIDDEN**
- Signed AAB upload to Console: **owner Console action**
EOF

