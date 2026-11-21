# Buy & Sell public readiness — 2026-11-21 (updated)

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
- Sources: `lib/havkar-fee-examples.cjs`, `lib/marketplace-connect.cjs`, `lib/stellar-checkout.cjs`
- Example €100 → buyer pays €102, seller receives €97, platform €5
- Evidence JSON: `store/MARKETPLACE_SETTLEMENT_EVIDENCE_20261121.json` (from unit test)

## What this branch completed
1. Stripe Checkout **idempotencyKey** for `marketplace_buy_checkout`
2. Marketplace **refund/dispute** webhook path (`settleMarketplaceCharge`) — no silent relist
3. `marketplace_public_readiness` action (no secrets returned)
4. Delete-after-message fix + conversation detach RPC
5. Seller Connect UI on `buy-sell.html` + existing `ad-details.html` buttons
6. Connect onboard allowed when `STRIPE_SECRET_KEY` present (Account Links ≠ live charge)
7. Terms draft sections `#marketplace-fees` / `#marketplace-refunds` + privacy Stripe/XLM note
8. XLM real-use review: `store/XLM_REAL_USE_REVIEW_20261121.md`
9. Settlement evidence test: `tests/marketplace-settlement-evidence.test.mjs`

## Owner-only blockers (cannot be invented by agent)
1. `HAVKAR_MARKETPLACE_PUBLIC_LIVE_PAYMENTS=true` — Owner approval only
2. ≥1 seller completes Connect with `charges_enabled` (KYC in Stripe Dashboard / hosted flow)
3. Confirm production webhook endpoint receives `REQUIRED_WEBHOOK_EVENTS`
4. Counsel review of fees/refunds/MiCA blanks in Terms + Direct_split legal package
5. Explicit approval: merge + production deploy + first live card/XLM charge
6. XLM Mainnet: `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION` + funded seller receive keys (refunds still manual for direct_split)

## Explicitly NOT done
- No real card/XLM customer charge
- No merge to main
- No production frontend deploy of this branch without Owner approval
- No invented bank accounts or secret keys
