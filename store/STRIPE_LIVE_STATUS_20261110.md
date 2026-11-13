# Stripe Live status — 10 November 2026

Account: **HAVKAR** `acct_1UJwZZECWiUpELSP` (livemode true). No new Stripe account created.

## Verified via Stripe MCP (read)

| Check | Result |
| --- | --- |
| `charges_enabled` | true |
| `payouts_enabled` | true |
| Requirements currently/past due | empty |
| Identity | individual verified |
| `card_payments` / `transfers` | active |
| Balance available | 0.73 EUR |
| Payout schedule | manual, delay_days 3 |
| Webhook `we_1UK6rgECWiUpELSPIQKXo4E9` | enabled → `https://havkar-app.vercel.app/api/stripe-webhook` |
| Webhook events | `checkout.session.completed` only |
| Connect connected accounts | **none** (empty list) |
| Default EUR bank on Stripe | **POSTEMOBILE** last4 `0596`, status `new` |
| Revolut Business attached as Stripe payout bank | **No** (Owner Dashboard action required) |

## Production app gates

| Flag / check | Result |
| --- | --- |
| `STRIPE_SECRET_KEY` present on Vercel Production | yes (value never printed) |
| `HAVKAR_REAL_PAYMENTS_ENABLED` | unset / false |
| `HAVKAR_STRIPE_LIVE_ENABLED` | unset / false |
| Customer-facing collection | paused |
| Real micro-charge | **not run** — Owner must confirm exact amount + Revolut payout bank first |

## Owner actions required (exact)

1. Stripe Dashboard → Settings → Bank accounts / payouts: attach **Revolut Business EUR** for HAVKAR DI JALILNIA AMIR (do not paste IBAN into HAVKAR git/UI).
2. Confirm Production `STRIPE_SECRET_KEY` is live (`sk_live_…` or `rk_live_…`) for `acct_1UJwZZECWiUpELSP`.
3. After (1)+(2): set `HAVKAR_STRIPE_LIVE_ENABLED=true` then `HAVKAR_REAL_PAYMENTS_ENABLED=true` on Vercel Production and redeploy.
4. Reply with an exact micro-charge amount (EUR) before any live test payment, refund, or payout is executed.
