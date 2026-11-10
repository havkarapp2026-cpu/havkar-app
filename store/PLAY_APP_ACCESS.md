# Google Play — App Access instructions (HAVKAR)

Status re-checked on production Supabase project `gispovnciifgikvgpzck` and site `https://havkar.online` (Europe/Rome reference: 10 November 2026).

This file is for Play Console **App access**. It does not contain a password. Do not put the Gmail password in the repository.

## Reviewer account

```
amirjalilnia01@gmail.com
```

Verified server-side:

| Check | Result |
| --- | --- |
| Account exists | PASS |
| Email confirmed | PASS |
| Auth provider | email (password login) |
| Google OAuth linked on this account | NOT linked (`providers` = email only) |
| Admin role | PASS — none |
| Play review entitlement (`havkar_private.play_review_business`) | PASS — true |
| Image budget under entitlement | PASS — business monthly limit 80 |
| Migration `play_review_entitlement` recorded | PASS — `schema_migrations` version `20261106204613` (repo file stamp `20261106143000`; do not re-run) |
| Edge Function `havkar-ai-assistant` | PASS — production version **21**, JWT required, **bundled** deploy (no runtime GitHub import); Play review policy present |

## How Google Play reviewers sign in

1. Open HAVKAR (Play build or `https://havkar.online/login.html`).
2. Sign in with **email and password** using the review account above.
3. Paste the existing account password into Play Console App Access. The password is held by the owner and is not stored here.
4. Optional: Google sign-in is available on the login page for other Gmail accounts. This review account is email/password only; do not tell reviewers they must use Google OAuth for this account.

## What the entitlement unlocks (without live card collection)

- HAVKAR AI text and image/logo generation under the business test budget.
- No Stripe live card checkout and no Pi Mainnet collection while public payment flags stay off.
- Stellar Wallet UI defaults to **Testnet**. Production Mainnet one-time XLM settlement is **armed** for enabled flows — reviewers should not treat XLM as Google Play Billing and should avoid live Mainnet spends during review unless Owner intentionally demonstrates that rail.

Live card switches remain off. Stripe webhook responds with `REAL_PAYMENTS_PAUSED`. Production flags observed 10 Nov 2026:

- `HAVKAR_REAL_PAYMENTS_ENABLED=false`
- `HAVKAR_STRIPE_LIVE_ENABLED=false`
- `HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=true` (armed; separate from Play Billing / IAP)

## Suggested App Access text for Play Console

```
Sign-in required for review of account features and HAVKAR AI.

URL: https://havkar.online/login.html
Username: amirjalilnia01@gmail.com
Password: <paste the existing password held by the owner — not stored in the repo>

Instructions:
1. Open the URL or the installed app.
2. Sign in with the email and password above (email/password form, not Google).
3. Open HAVKAR AI from the home screen to review text and logo/image generation.
4. Stripe card and Pi live collection stay disabled. Do not attempt a real card purchase.
5. Stellar Wallet defaults to Testnet. Do not send Mainnet XLM during review unless Owner asked for that demo.
6. Support Center: https://havkar.online/support.html
7. Privacy / account deletion request: https://havkar.online/privacy-request.html
```

## Owner action still required

- Paste the real password into Play Console App Access (owner only).
- Complete Play Console forms (Data safety, Financial features, content rating, closed testing track, screenshots).
