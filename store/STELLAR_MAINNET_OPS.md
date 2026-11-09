# Stellar Mainnet operations (HAVKAR)

## Activation prerequisites (all required)

1. Production schema allows `marketplace_payment_intents.network = 'mainnet'` (verified).
2. Migration history includes `20261109033000` (reconciled).
3. Owner-designated Mainnet receiving public key configured:
   - `HAVKAR_STELLAR_MAINNET_DESTINATION=GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM`
   - Horizon Public: account exists and is funded (verified).
4. Prove Owner control of that LOBSTR account:
   - Preferred: open `/mainnet-wallet-ownership.html`, connect LOBSTR extension with that account, sign the server challenge (`signMessage`, no XLM).
   - Fallback only if LOBSTR cannot signMessage: tiny outbound native payment FROM that account with the exact text memo shown on the page, then paste the Horizon tx hash.
5. `HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=true` on Vercel Production **only after explicit Owner authorization**, then redeploy.
6. Confirm `GET /api/payment-activation-status` → `stellar.mainnet_ready=true` and `stellar_mainnet_collection=armed` before any customer Mainnet quote.

Live status as of 9 Nov 2026 after Owner authorization: ownership verified, destination configured, flag **true**, smoke intent **settled** on Horizon Public. Re-check `/api/payment-activation-status` after every redeploy.

Never invent a destination. Never paste a secret seed into Vercel for this variable.
Never enable the Mainnet flag before ownership proof and explicit Owner permission.

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

## Owner-only Verify Payment (invoice page)

Use when Horizon already shows a matching Mainnet payment but the intent is still `unpaid`.

1. Deploy the branch that includes `xlm-invoice.html` owner Verify UI and `can_verify` on `/api/xlm-invoice`.
2. Open Production invoice while signed in as the **intent owner** (same Supabase user that created the quote):

```
https://havkar-app.vercel.app/xlm-invoice.html?intent=<INTENT_ID>&tx=<TX_HASH>
```

3. Confirm the page shows **Verify Payment** (only when session user matches intent `user_id` and status is `unpaid`). Guests and other accounts never see an enabled owner verify action.
4. Click **Verify Payment**. The browser sends the existing session Bearer token to `POST /api/create-event-checkout` with `payment_method=xlm`, `action=verify`, `intent_id`, `tx_hash`, `network=mainnet`. Tokens and service-role keys are never printed.
5. Server re-checks Horizon Public (success, memo, native amount, destination, unique hash) and only then updates the intent to `settled`.
6. Refresh or re-open the invoice until Production returns `status=settled` (and `paid`/`order_paid` true). Do **not** claim paid before that response.

Do not submit a second/duplicate on-chain payment hash for a different settlement, do not call refund for this flow, and do not enable unrelated payment methods.
