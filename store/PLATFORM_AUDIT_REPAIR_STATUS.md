# HAVKAR platform audit & repair status

Date: 2026-11-15  
Branch: `cursor/platform-audit-repair-d4b2` (PR #197, based on PR #196 tip)

## Completed in this repair pass

| Item | Status | Evidence |
| --- | --- | --- |
| Applied missing `user_blocks` migration (prod + staging) | PASS | Table exists with RLS + policies |
| Revoked anon EXECUTE on listing-conversation / reaction-emoji / event_interest_counts | PASS | SQL verify |
| Fixed `havkar_is_reaction_emoji` mutable `search_path` | PASS | search_path=public |
| Added `/api/payment-status` rewrite alias | PASS | `vercel.json` (needs deploy) |
| Expanded Cache-Control no-cache for Home modules + havkar-ai | PASS | `vercel.json` |
| Restored business application review UI | PASS | `verification-review.html` |
| PWA manifest/icon tags | PASS | official-app-icon test |
| Homepage glossary fa/ar/ckb/kmr/sv | PASS | homepage-glossary test |
| HAVKAR AI chrome i18n + data-i18n-label | PASS | havkar-ai-new-idea-i18n test |
| translateUniqueTexts offline merge (homepage+marketplace+UI dict) | PASS | havkar-i18n.js |
| Removed public auto payment probe dumps | PASS | accommodation/AI/profile |
| Stripe dry-run accepts Owner-armed | PASS | stripe-card-path-dry-run |
| Kurdish language CI assertion | PASS | kurdish-languages test |
| Checkout 133-currency mobile/tablet | PASS | prior preview evidence |
| Android unsigned bundleRelease | PASS | Gradle |
| iOS repo preflight | PASS | ios-release-preflight |
| npm audit prod | PASS | 0 vulnerabilities |

## Production smoke (live havkar.online)

| Check | Status |
| --- | --- |
| All 15 Home tiles HTTP 200 | PASS |
| `/api/global-payments` | FAIL — 404 until #196+#197 deploy |
| `/api/payment-status` | FAIL — 404 until #197 deploy |
| `/api/payment-activation-status` | PASS — collection **armed** |
| Accommodation honesty | PASS |

## Owner approval still required

1. Merge + deploy PR #196 then #197
2. Do not change live payment flags without explicit Owner approval
3. Enable Supabase Auth leaked-password protection in Dashboard
4. iOS: `APPLE_PROVISIONING_PROFILE_BASE64`
5. Android/iOS store upload remains Owner Console only
6. Flights/Trade/Hotels live booking stay blocked until partner/Owner gates

Platform is NOT declared 100% complete.
