# HAVKAR Stripe — Staging E2E PASS + Go-Live Arm (2026-11-12)

## Staging (PASS)
- Preview `STRIPE_SECRET_KEY` resolves to sandbox `acct_1UJwZzEAHNL6NCGl`
- Alias `staging.havkar.online` → `dpl_FjetNxyvbqr9JGGnCaD37ay7PKsN`
- E2E `POST /api/stripe-sandbox-payout-e2e` → HTTP 200
- Genuine Stripe event `evt_1Ub0pjEAHNL6NCGl7q3oC78V` (`payout.paid`) for `po_1Ub0pjEAHNL6NCGlQAU2idC8`
- Staging ledger rows in `stripe_webhook_events` + `stripe_payout_events` (livemode=false)
- No duplicate `stripe_event_id` rows
- Production DB does not contain these staging event ids

## Production readiness (verified read)
- Live account `acct_1UJwZZECWiUpELSP`: charges_enabled + payouts_enabled
- Live webhook `we_1UK6rgECWiUpELSPIQKXo4E9` → `https://havkar.online/api/stripe-webhook` (14 events, enabled)
- Fees in code/status: buyer 2% (200bps), seller 3% (300bps), services 10% (1000bps)
- Revolut EUR bank last4 8455 present; status=new (app marks healthy; bank details not modified)
- Production payment flags before arm: REAL=false, LIVE=false; customer_facing_collection=paused

## Go-live action
- Merge staging branch fixes into `main`
- Arm Production `HAVKAR_REAL_PAYMENTS_ENABLED=true` and `HAVKAR_STRIPE_LIVE_ENABLED=true` for verified Stripe ticket collection path only
- Marketplace Connect remains gated by code (`live_armed` false until Connect recipients verified)
- Unsupported modules stay OFF (subscription/recurring/trade/ai/jobs)
- No Owner-authorized real charge/transfer/refund/payout was executed as a smoke charge
