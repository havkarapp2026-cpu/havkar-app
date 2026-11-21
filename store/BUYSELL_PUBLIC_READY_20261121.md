# Buy & Sell public readiness — 2026-11-21

Branch: `cursor/buysell-public-ready-d4b2`  
Base freeze: `buysell-stable-20261120-pr244` → commit `affb20f0`  
Backup branch: `cursor/buysell-stable-backup-d4b2` (immutable; do not force-push)

## Restore previous stable
```
git fetch origin tag buysell-stable-20261120-pr244
git checkout buysell-stable-20261120-pr244
# Redeploy that exact commit only with Owner approval
```

## Fees (server-enforced)
- Buyer +2%, seller −3%, platform ≈5% of list
- Sources: `lib/havkar-fee-examples.cjs`, `lib/marketplace-connect.cjs`, `lib/stellar-checkout.cjs` (now imports same rates)
- Example €100 → buyer pays €102, seller receives €97, platform €5

## What this branch completed
1. Stripe Checkout **idempotencyKey** for `marketplace_buy_checkout`
2. Marketplace **refund/dispute** webhook path (`settleMarketplaceCharge`) — status `refunded`/`disputed`, audit only, no silent relist
3. `marketplace_public_readiness` action (no secrets returned)
4. Delete-after-message fix: conversation detach for `delete_own_marketplace_listing` (applied to production + staging)
5. Two-account security script hardened (paused live gates, RPC cleanup)

## Observed production (no live charge started)
- `HAVKAR_MARKETPLACE_PUBLIC_LIVE_PAYMENTS` → public Buy Now OFF (`MARKETPLACE_PUBLIC_LIVE_OFF`)
- Stripe/real flags may be armed globally, but marketplace public gate still blocks customer Checkout URL
- Connect sellers with `charges_enabled`: **0**
- Ads: 17 marketplace rows; XLM intents present with split columns
- Testish leftovers: e2e SEK probe listings cleaned via owner RPC this turn; real seller listing #82 left untouched

## Owner blockers before live public activation
1. Set/confirm `HAVKAR_MARKETPLACE_PUBLIC_LIVE_PAYMENTS` only after approval
2. At least one seller completes Stripe Connect with `charges_enabled`
3. Confirm webhook endpoint receives required events (incl. charge.refunded / dispute.*)
4. Confirm legal pages disclose 2%/3% fees + refund/dispute policy
5. Explicit Owner approval for merge + production deploy + first live charge

## Explicitly NOT done
- No real card/XLM customer charge
- No merge to main
- No production frontend deploy of this branch
- No invented bank accounts or secret keys
