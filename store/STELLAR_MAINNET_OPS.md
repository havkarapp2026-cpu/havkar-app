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
6. Confirm `GET /api/payment-activation-status` → `stellar.mainnet_ready=true` and `stellar_mainnet_collection=armed`.
7. **Customer live collection (separate key):** set `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION=true` only after final Owner approval of the XLM release branch, then redeploy. Until then customer Mainnet quotes return `STELLAR_MAINNET_LIVE_COLLECTION_OFF`. Testnet remains available.
8. Confirm `stellar.mainnet_customer_live=true` / `stellar_mainnet_customer_live=armed` before any customer Mainnet quote.

Never invent a destination. Never paste a secret seed into Vercel for this variable.
Never enable the live-collection flag before ownership proof, arming flag, and explicit Owner permission.

## Supported one-time flows

| Flow | Surface | Notes |
| --- | --- | --- |
| `marketplace` | Buy & Sell / `ad-details.html` | Physical/goods listings (`listing_surface=marketplace`). Ends listing after settlement. |
| `services` | `services.html` | One-time priced services only (not hour/day/week/month). |
| `events` | `events.html` | Issues event ticket after Horizon verify. |

Unsupported via XLM: `trade`, `subscription`, `recurring`, `ai`, `jobs` (digital entitlements require Play Billing / Apple IAP).

## Settlement rules (enforced in code)

- Quote stores destination, memo, amount_xlm, network, expiry, subject_id.
- Server validates subject exists, price match, and forbids self-purchase.
- Verify requires Horizon `successful=true`, matching text memo, native asset, exact amount, exact destination, matching network Horizon.
- `tx_hash` unique; unpaid→settled is conditional; replay refused.
- Missing Horizon tx → `settlement=pending` (order stays unpaid).
- Unsuccessful Horizon tx → `settlement=failed` (order stays unpaid).
- Orders / listings / tickets are not paid until verify succeeds.

## Fees (unchanged)

- Marketplace: buyer 2%, seller 3%
- Services: provider commission 10% (1000 bps)
- Stellar network fee is separate (`0.00001` XLM quoted)

## Refund procedure (Owner-operated signing)

1. Locate settled intent (`id`, `payer_account`, `amount_xlm`, `tx_hash`).
2. From the **merchant Mainnet account** (same as destination), send native XLM back to `payer_account` for the same amount (network fee separate).
3. Call checkout `action=refund` with `intent_id` + refund `tx_hash`.
4. Server verifies Horizon and marks `refunded`. App never holds the merchant secret.

## Owner-only Verify Payment (invoice page)

Use when Horizon already shows a matching payment but the intent is still `unpaid`.

1. Open Production invoice while signed in as the **intent owner**:

```
https://havkar.online/xlm-invoice.html?intent=<INTENT_ID>&tx=<TX_HASH>
```

2. Confirm **Verify Payment** is shown only for the intent owner while status is `unpaid`.
3. Server re-checks Horizon and only then updates the intent to `settled`.

## Legal / store notes

- Play Financial features: cryptocurrency wallet + digital wallet declarations apply when wallet/XLM surfaces ship.
- Physical goods / physical services / live-event tickets may use non-Play processors under Play Payments policy §3.
- Digital AI/Jobs subscriptions must not use XLM inside Play/App Store builds.

## Smoke test (Owner)

Only after `mainnet_customer_live=true` and compliance sign-off: one tiny Mainnet payment through Buy & Sell, Services, or Events, then confirm intent `settled` and Horizon hash.
