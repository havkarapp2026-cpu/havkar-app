# Stellar Mainnet operations (HAVKAR)

## Activation prerequisites (all required)

1. Production schema allows `marketplace_payment_intents.network = 'mainnet'` (verified).
2. Migration history includes `20261109033000` (reconciled).
3. Owner provides **approved** Mainnet receiving public key `G...`.
4. Vercel Production:
   - `HAVKAR_STELLAR_MAINNET_DESTINATION=<that G... key>`
   - `HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=true` (exact)
5. Redeploy Production.
6. `GET /api/payment-activation-status` → `stellar.mainnet_ready=true`.

Never invent a destination. Never paste a secret seed into Vercel for this variable.

## Settlement rules (enforced in code)

- Quote stores destination, memo, amount_xlm, network, expiry.
- Verify requires Horizon Public `successful=true`, matching text memo, native asset, exact amount, exact destination.
- `tx_hash` unique; unpaid→settled is conditional; replay refused.
- Orders are not paid until verify succeeds.

## Refund procedure (Owner-operated signing)

1. Locate settled intent (`id`, `payer_account`, `amount_xlm`, `tx_hash`).
2. From the **merchant Mainnet account** (same as destination), send native XLM back to `payer_account` for the same amount (network fee separate).
3. Call checkout `action=refund` with `intent_id` + refund `tx_hash`.
4. Server verifies Horizon and marks `refunded`. App never holds the merchant secret.

## Unsupported

- Recurring / AI / Jobs XLM subscriptions
- Trade crypto
- Stripe/Pi live (separate flags; leave unchanged unless Owner asks)

## Smoke test (Owner)

Only after `mainnet_ready=true` and compliance sign-off: one tiny Mainnet payment through Buy & Sell or Events, then confirm intent `settled` and Horizon hash.
