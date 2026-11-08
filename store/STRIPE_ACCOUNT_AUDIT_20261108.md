# Stripe account audit — 8 November 2026

Audited via Stripe MCP after owner connected Stripe. **No secrets are printed.**

## Connected MCP accounts

| Account | stripe_context | livemode | Notes |
| --- | --- | --- | --- |
| HAVKAR-sandlåda | `acct_1UJwZzEAHNL6NCGl` | **false** (sandbox) | Only account in this MCP session |

**Live-mode Stripe account was not present in the MCP session.** Live eligibility for production charges is therefore **NOT VERIFIED**.

## Sandbox account evidence (`livemode=false`)

| Check | Result |
| --- | --- |
| `charges_enabled` | true |
| `payouts_enabled` | true |
| `details_submitted` | true |
| `default_currency` | eur |
| `country` | IT |
| `capabilities.card_payments` | active |
| `capabilities.transfers` | active |
| Balance available (EUR card) | 0 (sandbox) |
| Webhook endpoints listed | **none** (`data: []`) |

## Production app gates (Vercel)

| Check | Result |
| --- | --- |
| `GET /api/payment-activation-status` | `customer_facing_collection=paused` |
| `HAVKAR_REAL_PAYMENTS_ENABLED` | false |
| `HAVKAR_STRIPE_LIVE_ENABLED` | false |
| `POST /api/stripe-webhook` without signature | `REAL_PAYMENTS_PAUSED` |
| Vercel `STRIPE_WEBHOOK_SECRET` | configured (value not read) |
| Vercel secret key mode via status API | `unknown` / not armed |

## Activation decision (evidence-based)

| Provider | Activate now? | Reason |
| --- | --- | --- |
| Stripe **live** customer charges | **NO** | Live account not connected/verified in MCP; no separate live charges_enabled proof |
| Stripe **sandbox** engineering | YES for tests only | Sandbox charges_enabled=true; still do not flip production master flag |
| Pi | **NO** | Individually disabled; incomplete Mainnet path |
| Trade | **NO** | Individually disabled |
| Stellar Mainnet | **NO** | Source flag false; no irreversible Mainnet charge without separate amount confirmation |

## Owner next actions for Stripe live

1. In Stripe MCP / Access, authorize the **live** HAVKAR merchant (not only sandbox). Reconsent URL was issued by `manage_stripe_accounts` when needed.
2. Confirm live Dashboard: charges enabled, payouts enabled, business verification complete, webhook to `https://havkar-app.vercel.app/api/stripe-webhook` for live events.
3. Confirm whether Vercel `STRIPE_SECRET_KEY` is test, live, or restricted; set `HAVKAR_STRIPE_LIVE_ENABLED=true` only for live secrets.
4. Only after the above: set `HAVKAR_REAL_PAYMENTS_ENABLED=true` on Vercel Production and redeploy.
5. First live charge still needs a **separate** owner confirmation of exact amount and action.
EOF

