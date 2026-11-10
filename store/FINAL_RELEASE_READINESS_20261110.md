# HAVKAR final release readiness — 10 November 2026

Branch: `cursor/havkar-final-release-readiness-d4b2`

## Deployment checklist (Owner)

1. Review PR; do **not** merge until Owner approval.
2. Confirm Vercel Production env:
   - `HAVKAR_REAL_PAYMENTS_ENABLED` / Stripe live: remain paused / OFF
   - `HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED` — only if intentional
   - `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION` — must stay unset/`false` until legal + Owner go-live
   - Stellar destinations: public keys only (no secrets)
3. Apply Supabase migration `20261110183000_user_blocks_and_event_interest_anon_revoke.sql` on Production (Owner).
4. Deploy web after merge approval.
5. Dispatch Android signed AAB workflow; upload to Play Closed testing.
6. Fix Apple Distribution profile / cloud signing; re-run iOS Release `signed_ipa`; TestFlight.
7. Counsel review of `store/PLAY_CRYPTO_COMPLIANCE_20261110.md` before EU crypto distribution.
8. Only then consider LIVE_COLLECTION.

## Rollback plan

| Layer | Rollback |
| --- | --- |
| Vercel | Redeploy previous Production deployment; unset LIVE_COLLECTION immediately if set by mistake |
| Supabase | New migration to disable policies only if breaking; do not drop `user_blocks` with user data without backup |
| Android | Halt Play rollout / retain prior AAB track; versionCode must only increase |
| iOS | Do not submit IPA; keep prior TestFlight build if any |
| Payments | Env flags OFF — no Mainnet customer collection without flag |

## Owner-only actions (priority)

1. Legal counsel MiCA/CASP + IT before Mainnet live + Play crypto worldwide
2. Apple profile / ASC cloud signing → IPA
3. Play Closed testing enrollment + real 14-day evidence
4. Approve merge/deploy of this branch
5. Production migration apply
6. SCF submit only if Owner decides (package ready; prior Interest Form rejected)

## Agent prohibitions honored

- No merge / Production deploy by agent
- No Mainnet customer spend
- No Stripe/Pi activation
- No invented testers / licenses / metrics
