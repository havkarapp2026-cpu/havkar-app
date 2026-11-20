# Jobs / Employment audit — 2026-11-20

Base: `buysell-stable-20261120-pr244` / `affb20f0`  
Branch: `cursor/jobs-employment-stabilize-d4b2`  
Rule: **do not modify Buy & Sell files on this branch.**  
Payments: Stripe/Stellar live remain OFF (`HAVKAR_JOB_PAYMENTS_ENABLED` gated; UI does not create live Checkout even if armed).

## Existing capabilities
- Public/owner job list + post/edit/delete own jobs (`jobs.html`, `havkar-jobs.js`)
- Search/filter + `?q=` from search hub
- External apply links (URL/email/phone) — **not** in-app `job_applications`
- Billing catalog / quotes (`havkar-job-billing.js`, `jobs_quote` via `create-event-checkout`)
- Home tile → `jobs.html` works

## Live DB (observed)
- `jobs`: 2 rows, both `pending_payment` (Debug Job, E2E Kitchen Assistant)
- Tables exist with RLS: `job_companies`, `job_company_members`, `job_subscriptions` (0), `job_applications` (1), `job_payment_events` (RLS on, **0 policies**)
- Repo migrations do **not** fully document company/subscription/application schema (drift vs production)

## Real problems
1. Card checkout never created — `startRealPayment` alerts and leaves job inactive
2. XLM path is quote-only; does not activate listing
3. Stripe webhook does not call `havkar-job-billing` fulfillment helpers
4. Company/subscription/application tables unused by frontend
5. `jobs.html?mine=1` from profile ignored
6. Schema drift: live DB columns/functions ahead of repo migrations
7. Stale test expects old “payment gateway not connected” copy

## Next work (this branch only)
- Align Jobs UX + honest payment gating without touching marketplace
- Wire application/company flows only after Owner approval for schema migrations
- No merge / production deploy / payment activation without Owner approval
