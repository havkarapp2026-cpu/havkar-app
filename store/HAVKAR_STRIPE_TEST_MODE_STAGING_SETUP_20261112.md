# HAVKAR Stripe Test Mode staging setup — 2026-11-12

Status: **PARTIAL** — agent work complete through deploy/domain/env inspection; Owner credentials still required. Production unchanged. Real payments remain OFF. No e2e PASS claimed.

## STAGING DEPLOY

| Item | Value |
| --- | --- |
| Stable branch | `cursor/stripe-test-mode-staging-d4b2` |
| Base | latest `main` at branch creation (`b77714cd`) then staging evidence commit |
| Domain | `staging.havkar.online` (verified in Vercel) |
| Prior domain gitBranch | `cursor/business-pages-ai-4038` (stale) |
| Target domain gitBranch | `cursor/stripe-test-mode-staging-d4b2` |
| Production | untouched; live flags remain false / collection paused |

## STAGING DATABASE

| Item | Value |
| --- | --- |
| Project | `havkar-staging` |
| Ref | `keglioewbkgdabsizvys` |
| URL | `https://keglioewbkgdabsizvys.supabase.co` |
| Status | `ACTIVE_HEALTHY` (eu-west-2) |
| Isolated from Production | yes (`gispovnciifgikvgpzck`) |
| Stripe tables present | `stripe_webhook_events`, `stripe_payout_events`, `marketplace_seller_connect_accounts` |

## STRIPE TEST CONFIGURATION (Preview / branch)

Configured on Preview for `cursor/stripe-test-mode-staging-d4b2` (non-secret):

- `SUPABASE_URL` → staging project URL
- `HAVKAR_REAL_PAYMENTS_ENABLED=false`
- `HAVKAR_STRIPE_LIVE_ENABLED=false`
- `HAVKAR_STRIPE_TEST_CHECKOUT_ENABLED=true`

Intentionally **not** copied from Production Live:

- `STRIPE_SECRET_KEY` (Live) — Production only
- `STRIPE_WEBHOOK_SECRET` (Live) — Production only
- Production `SUPABASE_SERVICE_ROLE_KEY` — Production only

Missing on Preview for this staging branch (Owner must enter securely):

1. `STRIPE_SECRET_KEY` = Stripe **Test** secret (`sk_test_…`) — Preview + this git branch only
2. `STRIPE_WEBHOOK_SECRET` = signing secret from a **new Test Mode** webhook endpoint (`whsec_…`)
3. `SUPABASE_SERVICE_ROLE_KEY` = **staging** service role for `keglioewbkgdabsizvys` (never Production)

## VERIFIED WEBHOOK URL (target)

```
https://staging.havkar.online/api/stripe-webhook
```

Stripe Test Mode webhook endpoints on sandbox account: empty until Owner creates the endpoint.

## Safety rules observed

- No Live Stripe secrets written to Preview
- No secret values printed in this report
- Production payments remain OFF
- No fake Test Mode e2e PASS
