# HAVKAR Stripe Test Mode staging repair — 2026-11-12

## Root cause

1. `api/stripe-webhook.js` constructed `new Stripe(process.env.STRIPE_SECRET_KEY)` at **module load**. Missing/unavailable key → unhandled `Neither apiKey nor config.authenticator provided` → HTTP 500 `FUNCTION_INVOCATION_FAILED`.
2. Preview deploy was **stale** vs later Preview env edits (`STRIPE_SECRET_KEY` added after last Ready deploy).
3. Duplicate Preview-wide `STRIPE_SECRET_KEY` (`N7XfANv7EPMRQecZ`) conflicted with branch-scoped staging key; neutralized to `development` only.
4. Preview still lacked `STRIPE_WEBHOOK_SECRET` and staging `SUPABASE_SERVICE_ROLE_KEY`.
5. Vercel Authentication blocked anonymous Stripe POSTs to `staging.havkar.online` (now disabled for this project so Test Mode delivery can reach the function).

## Changes / commits

| Commit | Change |
| --- | --- |
| `81887fba` | Fail-closed Stripe webhook init + staging isolation helpers/tests |
| Deploy | `dpl_EuW1TXjTWWBRC5qZGS64Tuw7HbHc` READY on `81887fba` |

Files: `lib/stripe-runtime.cjs`, `api/stripe-webhook.js`, `tests/stripe-runtime-isolation.test.mjs`, `tests/real-payments-pause.test.mjs`

## Verified runtime (staging)

- Deployment URL: `https://havkar-jejhbb53c-havkarapp2026-4055s-projects.vercel.app`
- Domain: `https://staging.havkar.online` → deploy above
- `secret_key_mode=test` (masked; value never printed)
- `test_checkout_allowed=true`
- `webhook_secret_configured=false`
- GET `/api/stripe-webhook` → **405** Method not allowed (no crash)
- POST unsigned → **403** `REAL_PAYMENTS_PAUSED`
- POST invalid signature → **503** `STRIPE_RUNTIME_CONFIG_ERROR` / `STRIPE_WEBHOOK_SECRET missing`
- Staging DB webhook ledger remains empty (no signed Test delivery yet)
- Production status: collection paused, live flags false, `secret_key_mode=live`, webhook configured — **unchanged**

## CI / tests

- Local: 19/19 pass (`stripe-runtime-isolation`, pause-processing, real-payments-pause, secret-mode, webhook-processor)

## Remaining Owner action (ONE)

Stripe MCP write is Unauthorized in this environment, so the agent cannot create the Test Mode endpoint or invent `whsec` / staging service role.

**Exact action:** In Vercel → Environment Variables → **Preview** → git branch `cursor/stripe-test-mode-staging-d4b2`, set `STRIPE_WEBHOOK_SECRET` to the signing secret (`whsec_…`) of a **Stripe Test Mode** webhook endpoint whose URL is exactly `https://staging.havkar.online/api/stripe-webhook` (14 required events), and set `SUPABASE_SERVICE_ROLE_KEY` to the **staging** project `keglioewbkgdabsizvys` service role only — then Redeploy that branch. Do not use Live secrets.
