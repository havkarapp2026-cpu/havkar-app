# Stripe LIVE verification — 8 November 2026 21:17 UTC

MCP access: **Live HAVKAR + Sandbox**, **read-only**.  
No secrets printed. No charges, payouts, refunds, or flag flips performed.

## Accounts in MCP session

| Name | Account ID | livemode |
| --- | --- | --- |
| HAVKAR | `acct_1UJwZZECWiUpELSP` | **true** |
| HAVKAR-sandlåda | `acct_1UJwZzEAHNL6NCGl` | false |

## Live account status (`acct_1UJwZZECWiUpELSP`)

| Check | Result |
| --- | --- |
| Display name | HAVKAR |
| Country / currency | IT / EUR |
| Business type | individual |
| Business URL | https://havkar.online |
| Support address | Via Lucifero 40, 88900 Crotone KR, IT |
| `details_submitted` | true |
| `charges_enabled` | **true** |
| `payouts_enabled` | **true** |
| `requirements.currently_due` | [] |
| `requirements.past_due` | [] |
| `requirements.pending_verification` | [] |
| `requirements.disabled_reason` | null |
| `future_requirements.currently_due` | [] |
| Identity verification | individual **verified** (document on file) |
| `capabilities.card_payments` | active |
| `capabilities.transfers` | active |
| `capabilities.cartes_bancaires_payments` | pending (non-blocking for card Checkout) |
| Statement descriptor | HAVKAR |
| Dashboard timezone | Europe/Rome |
| Payout schedule | **manual**, delay_days 3 |
| Balance available | **0.73 EUR** (card) |
| Balance pending | 0 EUR |

## Payout bank (live)

| Field | Value |
| --- | --- |
| Bank name | **POSTEMOBILE S.P.A.** |
| Country / currency | IT / EUR |
| Last4 | 0596 |
| Routing | PPAYITR1 |
| Status | **new** (not `verified`) |
| Default for EUR | true |
| Revolut Business | **Not attached** on this live account |

## Live webhook configuration

| Field | Value |
| --- | --- |
| Endpoint ID | `we_1UK6rgECWiUpELSPIQKXo4E9` |
| URL | https://havkar-app.vercel.app/api/stripe-webhook |
| Status | **enabled** |
| livemode | true |
| enabled_events | `checkout.session.completed` only |
| Matches current ticket code | Yes (`api/stripe-webhook.js` handles that event) |

Read-only access: agent **cannot** add events or rotate the signing secret. Owner must use Dashboard for writes.

## Production app gates (still)

| Check | Result |
| --- | --- |
| `customer_facing_collection` | paused |
| `HAVKAR_REAL_PAYMENTS_ENABLED` | false / unset |
| `HAVKAR_STRIPE_LIVE_ENABLED` | false / unset |
| `STRIPE_SECRET_KEY` mode via status API | **unknown** |
| `STRIPE_WEBHOOK_SECRET` configured | true (value not read) |
| Unsigned webhook POST | `REAL_PAYMENTS_PAUSED` |

## Activation decision

**Stripe Live customer collection: NOT ACTIVATED.**

Account eligibility for charges/payouts is largely GREEN, but production remains safely paused until the blockers below are cleared by the owner.

## Exact blockers (ordered)

1. **Production `STRIPE_SECRET_KEY` mode is `unknown`** — replace with the Live HAVKAR secret `sk_live_…` (or restricted `rk_live_…`) from Dashboard → Developers → API keys for account `acct_1UJwZZECWiUpELSP`. Do not leave a non-Stripe or malformed value.
2. **Activation flags unset** — after key mode reports `live`, set on Vercel Production only:
   - `HAVKAR_STRIPE_LIVE_ENABLED=true`
   - `HAVKAR_REAL_PAYMENTS_ENABLED=true`
   Then redeploy / wait for production assign.
3. **Payout bank status `new`** — confirm PosteMobile `…0596` in Dashboard (or attach Revolut if that is the intended payout account). `payouts_enabled=true` already, but bank is not `verified`.
4. **Separate exact-amount confirmation** — required before any real charge, payout, transfer, or refund.
5. **PR #133 not merged** — per-provider status schema and latest gates land with that PR; do not auto-merge.
6. **Read-only MCP** — webhook event expansion (refunds/subscriptions) needs Dashboard if desired; not required for current ticket Checkout path.

## Explicitly still disabled

- Pi (`HAVKAR_PI_PAYMENTS_ENABLED`)
- Trade (`HAVKAR_TRADE_ENABLED`)
- Stellar Mainnet (`STELLAR_MAINNET_PAYMENTS_ENABLED = false` in source)
