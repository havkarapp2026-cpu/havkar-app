# HAVKAR — Production activation status

Verified on production (`https://havkar-app.vercel.app`) and Supabase project `gispovnciifgikvgpzck`.  
**Live unrestricted money collection and Stellar Mainnet remain OFF** until the owner explicitly approves final activation (request item 11).

## Summary

| Area | Verdict |
| --- | --- |
| Customer-facing real card / Pi / trade collection | **YELLOW** — implemented but paused by owner switches |
| Stellar Mainnet payments | **YELLOW** — source hard-off (`STELLAR_MAINNET_PAYMENTS_ENABLED = false`) |
| Stellar Testnet quote + verify | **GREEN** (plumbing) — destination env may still be needed |
| Marketplace fees / service commission (10% / 1000 bps) | **GREEN** — preserved in schema + UI |
| Ads / Business verification / marketplace isolation | **GREEN** — previously verified on `main` |
| Payments “fully live” claim | **NOT CLAIMED** |

## GREEN — implemented and verified

1. **Real-payments pause gate** (`lib/real-payments.cjs`)
   - Production `POST /api/stripe-webhook` returns `REAL_PAYMENTS_PAUSED` without signature when collection is paused.
   - Live Stripe keys additionally require `HAVKAR_STRIPE_LIVE_ENABLED=true`.
2. **Stellar Mainnet hard-off** in `stellar-wallet-source.js` (`STELLAR_MAINNET_PAYMENTS_ENABLED = false`) plus submit refusal for PUBLIC / horizon.stellar.org.
3. **Idempotent marketplace / Stellar Testnet intents** with Horizon verify + refund path (`lib/stellar-checkout.cjs`, table `marketplace_payment_intents`).
4. **Service commission ledger** at **1000 bps (10%)** (`service_commission_entries`) — preserved.
5. **Marketplace fee model** buyer 2% / seller 3% in Stellar checkout helper — preserved.
6. **Ads lifecycle + business verification** migrations applied; Ads start as `pending_review`.
7. **Automated payment-gate tests** (`tests/real-payments-pause.test.mjs`, stellar/pi tests) pass.
8. **Read-only activation status** endpoint: `/api/payment-activation-status` (rewrite → `create-event-checkout?havkarAction=paymentStatus`) — no secrets returned.
9. **Stripe fiat allow-list helper** for EUR/USD (`lib/stripe-fiat-currency.cjs`); event tickets remain EUR-priced (no silent FX).
10. **Checkout hardening (still gated)**: removed hardcoded `payment_method_types`; added Stripe idempotency key on event Checkout Session create.

## YELLOW — pending external approval / configuration

| Blocker | Owner action |
| --- | --- |
| `HAVKAR_REAL_PAYMENTS_ENABLED` unset / not `"true"` | Explicit approval to arm real collection |
| `HAVKAR_STRIPE_LIVE_ENABLED` | Required if `STRIPE_SECRET_KEY` is `sk_live_*` |
| Stripe account eligibility / Tax / payouts / Connect (if marketplace payouts) | Confirm in Stripe Dashboard; agent must not invent confirmations |
| Event ticket USD | Needs owner-approved FX/pricing policy (currently refused with 409) |
| Stellar Mainnet | Explicit approval + flip source constant + destination/compliance review |
| `HAVKAR_STELLAR_TESTNET_DESTINATION` | Public key only, if Testnet settlement used in prod UI |
| Pi Mainnet / trade-crypto | Remain unavailable while paused |
| Business app `#1` approval | Still needs genuine VAT/address/docs + independent reviewer |
| Play / App Store Console | Owner metadata, screenshots, Data safety, closed testing |
| Supabase HIBP / advisor WARNs | Owner review on Free plan limits |

## RED — confirmed defects / gaps (not invented)

| Item | Evidence |
| --- | --- |
| Customer-facing live money is **not** active | Prod webhook `REAL_PAYMENTS_PAUSED`; status endpoint `customer_facing_collection=paused` |
| Event tickets lack multi-currency pricing table | USD request returns 409 by design until FX policy exists |
| Stripe MCP account eligibility | Not verified here — Stripe MCP requires interactive auth; no invented KYC/approval |
| Prior Esito business evidence | Removed during earlier diagnostic replace; owner must re-upload genuine documents |

## Exact activation sequence (owner only)

Do **not** run this until legal/security checklist is signed off:

1. Confirm Stripe Dashboard live mode, webhook endpoint, Tax/registrations as needed.
2. Set Vercel Production:
   - `HAVKAR_REAL_PAYMENTS_ENABLED=true`
   - If using `sk_live_…`: `HAVKAR_STRIPE_LIVE_ENABLED=true`
3. Redeploy / verify `GET /api/payment-activation-status` shows `customer_facing_collection=armed`.
4. Smoke one **small live** charge in a controlled flow, then webhook reconciliation.
5. Stellar Mainnet: separate explicit approval; change `STELLAR_MAINNET_PAYMENTS_ENABLED` only then; never invent Mainnet tx hashes.

## Verification commands

```bash
node --test tests/real-payments-pause.test.mjs tests/stripe-fiat-currency.test.mjs tests/stellar-checkout.test.mjs
node scripts/verify-payment-activation-gates.mjs
```

## Files changed in this activation-readiness pass

- `lib/stripe-fiat-currency.cjs` (new)
- `api/create-event-checkout.js` (fiat allow-list, idempotency, status action, dynamic PMs)
- `vercel.json` (rewrite for `/api/payment-activation-status`)
- `tests/stripe-fiat-currency.test.mjs` (new)
- `scripts/verify-payment-activation-gates.mjs` (new)
- `store/PRODUCTION_ACTIVATION_STATUS.md` (this file)
