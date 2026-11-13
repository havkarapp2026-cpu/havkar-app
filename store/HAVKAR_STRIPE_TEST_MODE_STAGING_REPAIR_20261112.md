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

## Redeploy after Preview `STRIPE_WEBHOOK_SECRET` update

| Item | Value |
| --- | --- |
| Commit | `aa1b916774783c4d82fd78b29fb79ba45ca3f68b` |
| Redeploy | `dpl_ELn4aq91bD8mdbh36oH3ezoNYVqR` **READY** |
| Alias | `staging.havkar.online` → that deploy |
| Proof secret rotated | prior agent whsec → HTTP 400 on new deploy |
| Staging flags | test key, webhook configured, REAL/LIVE false |
| Production | unchanged (count=1, REAL/LIVE false) |

## Stripe MCP

- Read connected: sandbox `acct_1UJwZzEAHNL6NCGl` + live `acct_1UJwZZECWiUpELSP`
- Sandbox webhook endpoints list: **empty** (`[]`); v2 destinations empty
- Write (`PostWebhookEndpoints` / customers): **Unauthorized** after “Connected Stripe”
- `manage_stripe_accounts` issued a **reconsent URL** so Owner can grant write scope
- Platform-pushed Test Mode delivery after redeploy: **not verified** (blocked)

## Remaining Owner action (required for Stripe-delivered Test event)

1. Open the Stripe MCP reconsent URL and grant **write** permission for the sandbox (not only connect/read).
2. Reply “Connected Stripe” again so the agent can create/send the Test Mode staging webhook event.

Do **not** use Live secrets or change Production. Live payments stay OFF.
