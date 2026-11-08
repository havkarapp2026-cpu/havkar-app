# Stripe account audit — 8 November 2026 (final execution pass)

Audited via Stripe MCP. **No secrets are printed or committed.**

## MCP connector permissions

| Check | Result |
| --- | --- |
| Accounts visible in session | **Only** `HAVKAR-sandlåda` (`acct_1UJwZzEAHNL6NCGl`) |
| `livemode` | **false** (sandbox) |
| Live account `HAVKAR` | **Not present** in this MCP session |
| Webhook create via MCP write | **Unauthorized** (sandbox write denied for webhook endpoints) |

**Live-mode Stripe account was not present in the MCP session.** Live eligibility for production charges is therefore **NOT VERIFIED**. Stripe live is **BLOCKED**.

### Exact owner action to unblock live MCP access

1. Open this Stripe MCP account authorization URL:

```
https://access.stripe.com/mcp/oauth2/authorize/sessions/oases_VaofAI0tgNrbUd
```

2. Select the **live** merchant named **HAVKAR** (Italian business), not only sandbox `HAVKAR-sandlåda`.
3. Grant the minimum permissions needed to read account status, capabilities, requirements, external/payout accounts, and webhook endpoints (and webhook write if you want the agent to create the live endpoint).
4. Reply in chat that live authorization is complete so the agent can re-list accounts and continue activation checks.

## Sandbox account evidence (`livemode=false`)

Re-read via `GET /v1/accounts/acct_1UJwZzEAHNL6NCGl`:

| Check | Result |
| --- | --- |
| Display / business name | HAVKAR-sandlåda |
| `business_type` | individual (sandbox profile) |
| `charges_enabled` | true |
| `payouts_enabled` | true |
| `details_submitted` | true |
| `default_currency` | eur |
| `country` | IT |
| `requirements.currently_due` | [] |
| `requirements.disabled_reason` | null |
| `capabilities.card_payments` | active |
| `capabilities.transfers` | active |
| Payout bank (sandbox) | `ba_…` bank_name **YETTEL BANK AD**, last4 **3456**, status **verified** |
| Revolut Business IBAN | **Not present / not verifiable** in this sandbox account |
| Webhook endpoints listed | **none** before this pass (`data: []`); MCP create returned Unauthorized |

Sandbox identity fields are Stripe test placeholders (for example sandbox person “Paul Lewis”). They are **not** proof of live HAVKAR KYC.

## Revolut Business payout check

| Check | Result |
| --- | --- |
| Owner states Revolut Business exists | Noted |
| Revolut IBAN attached to live Stripe | **Cannot verify** — live account not in MCP |
| Sandbox external account | Fake sandbox bank, not Revolut |
| Agent invented IBAN? | **No** |

## Vercel production env presence (names only; values not decrypted)

Present on Production:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`

Absent on Production (correct while paused):

- `HAVKAR_REAL_PAYMENTS_ENABLED`
- `HAVKAR_STRIPE_LIVE_ENABLED`
- `HAVKAR_PI_PAYMENTS_ENABLED`
- `HAVKAR_TRADE_ENABLED`

Live production status probe (8 Nov 2026):

- `GET /api/payment-activation-status` → `customer_facing_collection=paused`
- `secret_key_mode` reported as `unknown` on current production deploy (key exists but does not match `sk_live_` / `sk_test_` / `rk_live_` / `rk_test_` after trim). Owner must confirm the Production secret is a real Stripe secret key from the intended account.
- `POST /api/stripe-webhook` without signature → `REAL_PAYMENTS_PAUSED`

## Business rules already enforced in code (not activation)

| Rule | Where |
| --- | --- |
| Buy & Sell buyer 2% / seller 3% | `havkar-marketplace.js`, `lib/stellar-checkout.cjs` |
| Services provider commission 10% (1000 bps) | Supabase migration + services UI |
| Jobs paid listings / subscriptions | Gated; no false live collection |
| HAVKAR AI paid plans / no free usable logo generation | `supabase/functions/havkar-ai-assistant/policy.mjs` |
| Checkout webhook signature + replay guard | `api/stripe-webhook.js` |
| Per-provider pause gates | `lib/real-payments.cjs` |

## Activation decision (evidence-based)

| Provider | Activate now? | Reason |
| --- | --- | --- |
| Stripe **live** customer charges | **NO / BLOCKED** | Live account not connected in MCP; production master flag unset; key mode unknown |
| Stripe **sandbox** engineering | YES for tests only | charges_enabled=true; do not flip production master flag |
| Pi | **NO** | Individually disabled |
| Trade | **NO** | Individually disabled |
| Stellar Mainnet | **NO** | Source flag false |

## After live account is connected (agent will continue)

1. Re-run MCP account list; confirm `livemode=true` for HAVKAR.
2. Inspect live requirements, charges_enabled, payouts_enabled, Revolut/bank external account.
3. Create live webhook to `https://havkar-app.vercel.app/api/stripe-webhook` for Checkout / refund / subscription events (secret only into Vercel; never git).
4. Confirm Production `STRIPE_SECRET_KEY` is `sk_live_…` (or `rk_live_…`) for that same account.
5. Set `HAVKAR_STRIPE_LIVE_ENABLED=true` then `HAVKAR_REAL_PAYMENTS_ENABLED=true` only after those checks pass.
6. Still require a **separate** owner confirmation of exact amount before any real charge, payout, transfer, or refund.
