# Stripe activation blockers — 9 November 2026

Live Production `/api/payment-activation-status` (havkar-app.vercel.app):

- `customer_facing_collection`: **paused**
- `HAVKAR_REAL_PAYMENTS_ENABLED`: false
- `HAVKAR_STRIPE_LIVE_ENABLED`: false
- `stripe.secret_key_mode`: **unknown**
- `webhook_secret_configured`: true
- `stellar_mainnet_collection`: armed (independent of Stripe)

## Owner actions required before card collection

1. Confirm Production `STRIPE_SECRET_KEY` is a **live** key (Dashboard → Developers → API keys).
2. Attach **Revolut Business EUR** as the Stripe payout bank (replace/complete prior PosteMobile attachment). Never paste IBAN into HAVKAR git/UI.
3. After (1)+(2) and legal checklist: set `HAVKAR_STRIPE_LIVE_ENABLED=true` then `HAVKAR_REAL_PAYMENTS_ENABLED=true` on Vercel Production.
4. Expand webhook subscriptions for `charge.refunded` / `charge.dispute.*` if automated refund/dispute handling is required beyond Checkout completion.
5. Stripe Connect Express/Standard for marketplace seller payouts remains **not armed** — do not claim Connect payouts until account capability + contracts are confirmed in Dashboard.

## Explicit non-actions this release

- No fake Stripe account, fake Connect onboarding, or invented live-mode confirmation.
- No EUR payout claimed from Stellar XLM settlements.
