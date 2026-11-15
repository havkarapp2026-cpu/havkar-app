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
| Checkout 133-currency mobile (~375) + tablet (~820) UI | PASS | Preview: label 133 (not 60), list loaded, live payments gated OFF, no horizontal overflow |
| PR #197 CI (`audit` + Vercel deploy) | PASS | GitHub Actions `43714702108`; Vercel preview success |
| PR #197 preview `/api/global-payments` + `/api/payment-status` | PASS | Both HTTP 200; catalog `currency_count=133`; `public_live_checkout=false` |
| Stripe live readiness verifier vs Owner-armed prod | PASS | Accepts `armed`; unsigned webhook still rejected |
| New Idea action i18n (it/sv/ckb/kmr/ar/fa) | PASS | Dictionary + regression test |
| iOS repo preflight | PASS | `scripts/ios-release-preflight.sh` |
| Android unsigned `bundleRelease` smoke | PASS | Gradle BUILD SUCCESSFUL (local SDK) |

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
