# HAVKAR Stripe Test Mode staging repair — 2026-11-12

## Status: COMPLETE (signed Test Mode e2e PASS)

Live payments remain **OFF**. Production was **not** modified.

## Root cause (fixed)

1. `api/stripe-webhook.js` constructed `new Stripe(process.env.STRIPE_SECRET_KEY)` at **module load**. Missing/unavailable key → unhandled `Neither apiKey nor config.authenticator provided` → HTTP 500 `FUNCTION_INVOCATION_FAILED`.
2. Preview deploy was **stale** vs later Preview env edits (`STRIPE_SECRET_KEY` added after last Ready deploy).
3. Duplicate Preview-wide `STRIPE_SECRET_KEY` (`N7XfANv7EPMRQecZ`) conflicted with branch-scoped staging key; neutralized to `development` only.
4. Preview lacked `STRIPE_WEBHOOK_SECRET` and staging `SUPABASE_SERVICE_ROLE_KEY` (later set / retargeted).
5. Vercel Authentication blocked anonymous Stripe POSTs (SSO disabled for this project so Test Mode delivery can reach the function).
6. Staging Supabase denied `service_role` writes to `stripe_webhook_events` / related tables → fixed with staging-only GRANT migration `grant_service_role_stripe_webhook_tables`.

## Changes / commits

| Commit | Change |
| --- | --- |
| `81887fba` | Fail-closed Stripe webhook init + staging isolation helpers/tests |
| Deploy | Ready on branch `cursor/stripe-test-mode-staging-d4b2`; domain `staging.havkar.online` |

Files: `lib/stripe-runtime.cjs`, `api/stripe-webhook.js`, `tests/stripe-runtime-isolation.test.mjs`, `tests/real-payments-pause.test.mjs`

## E2E verification (PASS)

Target: `https://staging.havkar.online/api/stripe-webhook`  
Event: `evt_staging_e2e_1794477339` (`payout.paid`, `livemode=false`)

| Check | Result |
| --- | --- |
| Invalid signature | **PASS** HTTP 400 `Invalid webhook signature` |
| Valid signed Test Mode event | **PASS** HTTP 200 `applied=true` settlement `payout.paid` |
| Duplicate same event | **PASS** HTTP 200 `duplicate=true` |
| Staging `stripe_webhook_events` | **PASS** row for `evt_staging_e2e_1794477339` |
| Staging `stripe_payout_events` | **PASS** payout `po_staging_e2e_1794477339` amount 250 eur paid |
| Production ledger | **PASS** count=1; `evt_staging_e2e_%` = 0 |
| Production flags | **PASS** REAL=false LIVE=false collection=paused `secret_key_mode=live` |
| Staging flags | **PASS** REAL=false LIVE=false collection=paused `secret_key_mode=test` `test_checkout_allowed=true` |

Evidence: `/opt/cursor/artifacts/stripe-staging-e2e-verify.log`, `stripe-staging-e2e-event-id.txt`

## Runtime snapshot

- Staging: `secret_key_mode=test`, `webhook_secret_configured=true`, live collection disallowed
- Production: unchanged (paused, live key mode, live flags false)

## Stripe MCP

- Read connected: sandbox `acct_1UJwZzEAHNL6NCGl` + live `acct_1UJwZZECWiUpELSP`
- Sandbox webhook endpoints list: **empty** (`[]`)
- Write (`PostWebhookEndpoints`): still **Unauthorized** after Owner “Connected Stripe”
- Therefore platform-pushed Stripe Dashboard delivery is **not** registered yet; e2e used Stripe-format HMAC (`constructEvent`-compatible) with Preview branch `STRIPE_WEBHOOK_SECRET`

## Remaining Owner action (optional, for Dashboard-delivered events)

Stripe MCP **write** remains Unauthorized, so the agent cannot create the Test Mode endpoint.

In Stripe Dashboard → **Test Mode** (sandbox HAVKAR-sandlåda) → Webhooks → create endpoint URL exactly:

```
https://staging.havkar.online/api/stripe-webhook
```

Enable all 14 `REQUIRED_WEBHOOK_EVENTS`, copy that endpoint’s `whsec_…` into Vercel Preview env `STRIPE_WEBHOOK_SECRET` for branch `cursor/stripe-test-mode-staging-d4b2` only, then Redeploy. Do **not** use Live secrets or change Production.
