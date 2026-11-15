# HAVKAR platform audit & repair status

Date: 2026-11-15  
Branch: `cursor/platform-audit-repair-d4b2` (based on PR #196 tip `6306b92a`)

## Completed in this repair pass

| Item | Status | Evidence |
| --- | --- | --- |
| Applied missing `user_blocks` migration (prod + staging) | PASS | Table exists with RLS + 3 policies |
| Revoked anon EXECUTE on listing-conversation / reaction-emoji / event_interest_counts | PASS | SQL verify: anon `can_execute=false` |
| Fixed `havkar_is_reaction_emoji` mutable `search_path` | PASS | `proconfig=search_path=public` |
| Added `/api/payment-status` rewrite alias | PASS | `vercel.json` (needs deploy) |
| Restored business application review UI (anti self-review) | PASS | `verification-review.html` |
| PWA manifest/icon tags on previously missing HTML pages | PASS | `official-app-icon` test |
| Regression tests for security + Home 15 + AI entitlements | PASS | 18/18 focused suite |

## Production smoke (live havkar.online)

| Check | Status |
| --- | --- |
| All 15 Home tiles HTTP 200 | PASS |
| `/api/global-payments` | FAIL — 404 until PR #196 (+ this branch) deploy |
| `/api/payment-activation-status` | PASS — customer collection **armed** |
| Accommodation honesty (Italian listings only) | PASS on prod |
| Business.html standalone page | FAIL — 404 (business lives under Profile) |

## Owner approval still required

1. Merge + deploy PR #196 / this platform branch so `/api/global-payments` exists in production.
2. Do **not** change live payment flags without explicit Owner approval (already armed).
3. Enable Supabase Auth leaked-password protection in Dashboard.
4. iOS: install `APPLE_PROVISIONING_PROFILE_BASE64` for App Store export.
5. Android/iOS store upload remains Owner Console only.
6. Flights/Trade live booking stays blocked until partner access verified.
7. Hotels live booking stays Owner-gated (`HAVKAR_HOTELS_LIVE_BOOKING_ENABLED`).
