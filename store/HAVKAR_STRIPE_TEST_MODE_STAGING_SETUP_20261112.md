# HAVKAR Stripe Test Mode staging setup — 2026-11-12

Status: **PARTIAL — Owner credentials required.** No Test Mode e2e PASS. Production unchanged. Real card payments remain OFF.

## STAGING DEPLOY

| Item | Verified value |
| --- | --- |
| Stable branch | `cursor/stripe-test-mode-staging-d4b2` |
| Commit | `cb028839` (from latest `main` + this staging evidence) |
| Preview deployment | `dpl_8AWXSu5SLZBS8YetkMN27k9aJzK2` — **READY** |
| Preview URL | `https://havkar-m218hjnas-havkarapp2026-4055s-projects.vercel.app` |
| Domain alias | `staging.havkar.online` → assigned to that deployment |
| Runtime proof | Vercel logs show `domain=staging.havkar.online` + `branch=cursor/stripe-test-mode-staging-d4b2` |
| Domain gitBranch metadata | still `cursor/business-pages-ai-4038` (Owner must retarget for persistence) |
| Production | untouched (`havkar.online` still paused / Stripe live flags false) |

## STAGING DATABASE

| Item | Verified value |
| --- | --- |
| Project | `havkar-staging` |
| Ref | `keglioewbkgdabsizvys` |
| URL | `https://keglioewbkgdabsizvys.supabase.co` |
| Status | `ACTIVE_HEALTHY` |
| Isolation | separate from Production `gispovnciifgikvgpzck` |
| Stripe tables | `stripe_webhook_events`, `stripe_payout_events`, `marketplace_seller_connect_accounts` present |

## STRIPE TEST CONFIGURATION

Preview envs already set for `cursor/stripe-test-mode-staging-d4b2` only:

- `SUPABASE_URL` = staging URL
- `HAVKAR_REAL_PAYMENTS_ENABLED=false`
- `HAVKAR_STRIPE_LIVE_ENABLED=false`
- `HAVKAR_STRIPE_TEST_CHECKOUT_ENABLED=true`

Verified live status probe on staging (authenticated fetch):

- `secret_key_mode=missing`
- `webhook_secret_configured=false`
- `live_collection_allowed=false`
- `test_checkout_allowed=false` (flag alone is not enough without `sk_test`)

Safety check:

- Production `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` remain **production-only** (not copied to Preview)
- Stripe Test Mode webhook endpoints on sandbox account: **empty `[]`**

## VERIFIED WEBHOOK URL

Target URL for Stripe Test Mode endpoint:

```
https://staging.havkar.online/api/stripe-webhook
```

Verification performed:

1. Route is served by the new Preview branch (runtime log + deployment id).
2. Authenticated GET/POST reaches `api/stripe-webhook.js`.
3. Function currently fails with Stripe init error because Preview `STRIPE_SECRET_KEY` is absent (`Neither apiKey nor config.authenticator provided`).
4. Anonymous public POST currently returns **401 Vercel Authentication** — Stripe cannot deliver until Owner clears Deployment Protection for this staging host (or equivalent bypass). Production `havkar.online` remains publicly reachable for its Live webhook.

## EXACT OWNER ACTIONS REQUIRED

Do these in Dashboard only. Do **not** paste secret values into chat.

1. **Vercel → Project Domains → `staging.havkar.online`**
   - Set Git Branch to exactly: `cursor/stripe-test-mode-staging-d4b2`
   - Keeps future Preview deploys on this domain.

2. **Vercel → Deployment Protection**
   - Ensure Stripe can POST anonymously to `https://staging.havkar.online/api/stripe-webhook`
   - Current anonymous result is 401; Production custom domain already works without this block.

3. **Vercel → Environment Variables → Preview + git branch `cursor/stripe-test-mode-staging-d4b2`**
   - Add `STRIPE_SECRET_KEY` = Stripe **Test** secret (`sk_test_…`) — never Live
   - Add `STRIPE_WEBHOOK_SECRET` = Test endpoint signing secret (`whsec_…`)
   - Add `SUPABASE_SERVICE_ROLE_KEY` = **staging** service role for `keglioewbkgdabsizvys` — never Production
   - Redeploy the staging branch after saving

4. **Stripe Dashboard → Test Mode → Webhooks → Add endpoint**
   - URL: `https://staging.havkar.online/api/stripe-webhook`
   - Subscribe the required 14 events used by HAVKAR
   - Copy the endpoint `whsec_…` into Preview env (step 3)

5. **Do not**
   - Copy Live `sk_live` / Live `whsec` into Preview
   - Arm `HAVKAR_REAL_PAYMENTS_ENABLED` or `HAVKAR_STRIPE_LIVE_ENABLED` on staging or Production
   - Run real-money charges

After Owner completes 1–4, agent can re-verify unsigned signature → expected `400` (constructEvent path) and then a real Test card e2e.
