# Owner procedure — Freighter/LOBSTR Testnet direct_split (manual UI)

Use after Production migration for `stellar_receive_accounts` is applied and this branch is deployed to a preview/staging host (or local).

## Preconditions

- Two Stellar Testnet accounts funded via friendbot (buyer + seller)
- Seller signed into HAVKAR → Wallet → Save receive public key
- `HAVKAR_STELLAR_TESTNET_DESTINATION` = platform fee Testnet G… key
- LIVE_COLLECTION remains OFF

## Steps

1. Seller lists an active marketplace item with a positive EUR price.
2. Buyer opens listing → Pay with XLM (Testnet).
3. Confirm quote shows `settlement_model=direct_split` (or two destinations in wallet staging).
4. Buyer connects Freighter/LOBSTR Testnet and signs **one** transaction with two native payments.
5. Server verify succeeds; listing/order fulfillment path runs.
6. On Horizon Testnet, confirm:
   - payment to seller receive key = sellerReceives XLM
   - payment to platform destination = platform fee XLM
   - shared text memo matches intent

## Evidence to capture

- Horizon tx URL
- Intent id
- Screenshot of wallet approve (no secret keys)
- Seller balance change

## Automated evidence already produced

Agent Testnet E2E (server verification path): `tests/direct-split-testnet-e2e.test.mjs` → `/opt/cursor/artifacts/direct-split-testnet-e2e.json`
