# Owner as first Buy & Sell seller — secure Connect steps

**Owner identity (verified in production DB):**  
`havkarapp2026@gmail.com` · user_id `9b34b0bb-271a-49ee-aeb7-a9d28be06a06` · Amir Jalilnia

**Do not paste IBAN, passwords, Stripe secret keys, or ID documents in chat.**

## Observed facts (2026-11-21)
- Live Stripe platform `acct_1UJwZZECWiUpELSP` (HAVKAR): charges/payouts enabled for the **platform** account.
- Live Connect **connected accounts list: empty** — Owner is not yet a marketplace Connect seller.
- Sandbox platform has unfinished e2e Connect recipients (`charges_enabled=false`).
- Production `marketplace_seller_connect_accounts`: **0** rows.
- Preview readiness: Stripe secrets **absent** on Preview runtime until Owner binds them.
- Owner listings #8 and #12 had `status=null`; repaired to `active` (no delete).

## Secure path (Owner only)
1. In Vercel → Project → Environment Variables, ensure Production (and Preview if testing there) has `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (values never shared here).
2. Confirm webhook endpoint includes events in `REQUIRED_WEBHOOK_EVENTS` (Dashboard):

```
https://dashboard.stripe.com/webhooks
```

3. Sign in to HAVKAR as `havkarapp2026@gmail.com`.
4. Open Buy & Sell Preview (UI marker `20261121-owner-connect-v3`):

```
https://havkar-app-git-cursor-buyse-abdee9-havkarapp2026-4055s-projects.vercel.app/buy-sell.html
```

Production (after merge — not this step):

```
https://havkar.online/buy-sell.html
```

5. **Exact button location (Preview, UI `20261121-owner-connect-v5`):**
   - Banner **Seller payout setup (Stripe Connect + XLM)** sits **directly under the green Buy & Sell header**, **above** the Search bar.
   - Primary button: **Start / continue Stripe Connect** inside that banner.
   - Shortcut when signed in: header chip **Connect** (left of the bell) scrolls to the same banner.
6. Click **Start / continue Stripe Connect**.
   - If the Preview session expired, a **red alert** appears with **Sign in again** → `login.html?next=/buy-sell.html` (errors are not silent).
   - After a valid session, the official Stripe Account Link opens (`connect.stripe.com`). Enter KYC + bank **only there**. No charge from this step.
7. Return to `buy-sell.html?connect=return` and Refresh until `charges_enabled=true`.
8. Optional XLM: Wallet → save receive **public** key only.
9. **Stop.** Do not enable `HAVKAR_MARKETPLACE_PUBLIC_LIVE_PAYMENTS` or take a real buyer charge until a separate Owner approval message.

## API helpers (authenticated Owner session)
- `marketplace_connect_status` — includes `is_primary_owner` + `owner_prep`
- `marketplace_owner_seller_prep` — Owner-only checklist JSON (`charged: false`)
- `marketplace_connect_onboard` — creates Accounts v2 recipient + returns `onboarding_url` (no charge)

## Stable restore
```
git fetch origin tag buysell-stable-20261120-pr244
git checkout buysell-stable-20261120-pr244
```
Backup branch: `cursor/buysell-stable-backup-d4b2` @ `affb20f0`
