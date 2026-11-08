# Global-launch audit — 8 November 2026

## PR #113

| Item | Result |
| --- | --- |
| State | **MERGED** |
| Commit on `main` | `11c05ad84b6e…` is ancestor of `origin/main` |
| Scope | Paid AI pause restore + WalletConnect ESM test loading |
| Action | No further merge required. Safe merge plan: already completed historically. |

Open related work continues on PR #133 (payments/SCF) — separate; do not auto-merge.

## Completed in this pass (code)

| Requirement | Evidence |
| --- | --- |
| Buy & Sell server-side search/filters | `havkar-marketplace.js` `applyServerListingFilters`; `buy-sell.html` reloads on filter change |
| Fee transparency 2%/3% | `ad-details.html` marketplace fees row; `quoteListingFees(currency)` |
| Home AI tile i18n hook | `index.html` `data-i18n="havkarAi"` |
| Ads isolation preserved | existing surface filter + tests |
| Video ≤60s rules preserved | existing validation + migration |

## Verified unchanged (do not break)

- 15 Home tiles / 3-column grid (`tests/home-design.test.mjs`)
- Admin via Profile only
- Green branding assets
- Kurdish Sorani RTL / Kurmanji LTR (`tests/kurdish-languages.test.js`)
- AI free logo blocked without paid flag (`tests/ai-assistant.test.mjs`)
- Real payments paused (`tests/real-payments-pause.test.mjs`)
- Stellar Mainnet off in source

## Remaining owner blockers

1. Confirm Supabase production has marketplace video 60s migration applied
2. Review/merge this Buy & Sell PR after CI
3. Review PR #133 separately for payments/SCF (no auto-activate)
4. Play Console closed testing ≥12 / ≥14 — no Console evidence here
5. iOS signing / App Store — credentials not available in this environment
6. Device/browser manual E2E — not executed in this agent pass
7. Jobs corporate subscription tiers / 30-day paid listing — no complete live Stripe path found; remains gated

## Explicitly not enabled

Production card payments, paid AI, Pi Mainnet, Stellar Mainnet, paid tickets/subscriptions.
