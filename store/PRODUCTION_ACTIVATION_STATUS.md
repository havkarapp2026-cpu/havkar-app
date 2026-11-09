# HAVKAR — Production activation status (Stellar Mainnet)

Updated: **9 November 2026**  
Owner explicitly authorized **Stellar Mainnet** payments.  
**Stripe/Pi live card collection remains paused** until separate Owner flags are set.  
No secrets are stored in git. No mock payments.

## What is production-ready in code

| Area | Status |
| --- | --- |
| Buy & Sell one-time XLM | Ready when Mainnet env gates + destination are set |
| Services one-time XLM | Ready; customer pays listed price; provider commission **10% (1000 bps)** preserved |
| Events one-time XLM tickets | Ready; fulfillment records `stellar_mainnet` / `stellar_testnet` |
| Delivery one-time XLM | Ready (same checkout path) |
| Jobs / AI recurring XLM subscriptions | **NOT enabled** — `XLM_RECURRING_UNSUPPORTED` (cannot safely process recurring money with one-time XLM) |
| Trade crypto | Unchanged / unavailable |
| Marketplace fees | Buyer **2%** / seller **3%** preserved |
| Ownership for payment | Proven by signed Mainnet payment + Horizon `payer_account`; Testnet ownership challenge unchanged |
| Settlement finality | Horizon `successful=true` + memo + amount + destination match required before `settled` |
| Refunds | Server verifies Owner-submitted reverse payment on Horizon; does not hold/spend merchant secret |
| Client Mainnet capability | `STELLAR_MAINNET_PAYMENTS_ENABLED=true` in `stellar-wallet-source.js` (rebuild bundle) |

## Exact env gates (Owner / Vercel Production)

| Variable | Required value | Purpose |
| --- | --- | --- |
| `HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED` | exact `true` | Arms Mainnet quotes/settlement |
| `HAVKAR_STELLAR_MAINNET_DESTINATION` | Stellar public key `G...` | Receiving account (never a secret seed) |
| `HAVKAR_STELLAR_TESTNET_DESTINATION` | optional `G...` | Keeps Testnet path working |
| `HAVKAR_REAL_PAYMENTS_ENABLED` | still not required for Stellar | Controls Stripe/Pi/card collection |
| `HAVKAR_STRIPE_LIVE_ENABLED` | still off unless Owner wants live cards | Separate from Stellar |

## Database

Migration required before Mainnet intents can be stored:

`supabase/migrations/20261109033000_stellar_mainnet_payment_intents.sql`

Allows `marketplace_payment_intents.network IN ('testnet','mainnet')`.

## Compliance / ops blockers (Owner)

1. Apply the Mainnet network migration on production Supabase.
2. Set the two Mainnet env vars on Vercel Production and redeploy.
3. Confirm the Mainnet destination account is funded enough for network fees on refunds.
4. Confirm legal/tax/AML posture for receiving XLM on Mainnet in your jurisdictions.
5. Do **not** sell AI/Jobs as XLM subscriptions — recurring remains unsupported.
6. Stripe live / Pi mainnet remain separate Owner decisions.
7. Smoke one small Mainnet payment after deploy; verify `/api/payment-activation-status` shows `stellar_mainnet_collection=armed` and `stellar.mainnet_ready=true`.

## Verification commands

```bash
node --test tests/stellar-checkout.test.mjs tests/stellar-mainnet.test.mjs tests/stellar-settlement.test.mjs tests/real-payments-pause.test.mjs
node scripts/verify-payment-activation-gates.mjs
```

## Safety rules enforced

- No invented destinations, seeds, or Mainnet tx hashes
- No marking paid without Horizon verification
- No Automatic+Distribution signing conflict (iOS path unrelated)
- Secrets never printed by activation status endpoint
