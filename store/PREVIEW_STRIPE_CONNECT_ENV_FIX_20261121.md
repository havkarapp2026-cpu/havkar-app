# Preview STRIPE_SECRET_MISSING — cause and fix (2026-11-21)

## Cause
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` **did exist** in Vercel Project Settings as Preview secrets, but both were **git-branch-scoped** only to:

`cursor/stripe-test-mode-staging-d4b2`

The Buy & Sell Preview branch `cursor/buysell-public-ready-d4b2` therefore received **no** Stripe secret at runtime. Readiness correctly reported `STRIPE_SECRET_KEY_present: false` / blocker `STRIPE_SECRET_MISSING`.

No new keys were created. Values were never printed.

## Fix applied (Vercel only)
- Cleared `gitBranch` on existing Preview `STRIPE_SECRET_KEY` (id `TOJ4spWrA9mMjhWo`) so all Preview deployments receive the existing `sk_test` secret.
- Cleared `gitBranch` on existing Preview `STRIPE_WEBHOOK_SECRET` (id `7MJcRc8Fq1YRaHmy`).
- Force-redeployed Preview: `dpl_6qnXy4Mk8Wv24r2BEa1hW1sGGoXi` → READY.

## Verified after fix
- Readiness: `STRIPE_SECRET_KEY_present: true`, `STRIPE_WEBHOOK_SECRET_present: true`
- Blockers no longer include `STRIPE_SECRET_*`
- Authenticated `marketplace_connect_onboard` returned `onboarding_url` on host **`connect.stripe.com`** (`charged: false`)

## Owner KYC start (sign in required)
Sign in as `havkarapp2026@gmail.com`, then open:

```
https://havkar-app-git-cursor-buyse-abdee9-havkarapp2026-4055s-projects.vercel.app/buy-sell.html
```

Expand **Seller payout setup** → **Start / continue Stripe Connect** → Stripe-hosted KYC only. No live charge / merge / production publish.
