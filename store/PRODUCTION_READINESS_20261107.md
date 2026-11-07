# HAVKAR production readiness snapshot — 7 November 2026 (Europe/Rome)

Independent verification only. Items not re-tested are marked unverified.

## Supabase production (`gispovnciifgikvgpzck`)

| Item | Verdict | Evidence |
| --- | --- | --- |
| Edge Function `havkar-ai-assistant` | PASS | Version **21**, bundled, no GitHub import; JWT on; Play review strings present |
| Edge auth smoke | PASS | No auth → `401`; anon+en → sign-in required (not worker crash) |
| Play review DB function | PASS | `havkar_private.play_review_business` exists; reviewer returns `true` |
| Migration registration | PASS (aliased) | Recorded as `20261106204613` / `play_review_entitlement` |
| Re-run migration | NOT DONE | Correct — objects already present |
| Security advisors | PARTIAL | GraphQL WARNs cleared (pg_graphql dropped); DEFINER WARNs left for intentional RPCs; **HIBP BLOCKED** on Free plan |

## Google Play review access

| Item | Verdict |
| --- | --- |
| Account `amirjalilnia01@gmail.com` exists | PASS |
| Email confirmed | PASS |
| Admin role | PASS — none |
| `play_review_business` | PASS — true |
| Password / live AI session as reviewer | NOT VERIFIED (no password; agent must not invent) |
| Play Console forms / closed testing upload | BLOCKED — owner |

## Modules (static + unit evidence)

| Rule | Verdict | Evidence |
| --- | --- | --- |
| Buy & Sell 2 columns | PASS (code) | `buy-sell.html` `repeat(2,…)` |
| Explore / home 3 columns | PASS (code) | `index.html` `repeat(3,…)` |
| Product video max 60s | PASS (code+test) | `havkar-marketplace.js` `MAX_VIDEO_SECONDS=60`; marketplace isolation test |
| Buy & Sell vs Ads separation | PASS (test) | `tests/marketplace-isolation.test.js` |
| Full E2E UI of all 15 modules | PARTIAL | Automated tests pass; full manual UI not completed this turn |

## Payments / security

| Item | Verdict |
| --- | --- |
| `HAVKAR_REAL_PAYMENTS_ENABLED` must be `"true"` for paid AI | PASS (code+test) |
| Stripe pause path | PASS (unit) `REAL_PAYMENTS_PAUSE_OK` |
| Stellar Mainnet payments | OFF in source (`STELLAR_MAINNET_PAYMENTS_ENABLED = false`) |
| Stellar Testnet pay+verify UI | PARTIAL — `payAndVerify` wired; destination env required on production |
| Production payment enablement | NOT DONE — requires explicit owner approval after security/legal checklist |

## Android

| Item | Verdict |
| --- | --- |
| Package `online.havkar.app` | PASS |
| Unsigned cloud AAB CI | PASS (run 42292911126) |
| Signed AAB | PASS (run 42399945850); API 36 bump needs re-run |
| Keystore generator | PASS — existing upload key; do not regenerate without necessity |

## iOS

| Item | Verdict |
| --- | --- |
| Project + bundle id `online.havkar.app` | PASS (repo) |
| Signed IPA / TestFlight | BLOCKED — needs macOS/Xcode/Apple team |

## Stellar SCF

| Item | Verdict |
| --- | --- |
| Readiness draft | PASS (docs) — not submitted |
| External submit | BLOCKED — owner authorization required |

## Owner approvals still required

1. Paste reviewer password into Play Console App Access (owner-held only).
2. Set `HAVKAR_UPLOAD_BACKUP_AGE_RECIPIENT` to a public `age1...` or `ssh-ed25519 AAAA...` line (then related upload secrets) before signed AAB.
3. Complete Play / App Store Console metadata, screenshots, Data safety, content rating, closed testing / TestFlight.
4. Review Supabase security advisor WARNs.
5. Approve any production payment / Mainnet enablement (currently must stay off).
6. Approve SCF external submission after refreshing draft wording.
