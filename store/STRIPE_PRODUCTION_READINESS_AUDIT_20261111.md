# HAVKAR Stripe production-readiness audit — 11 November 2026

**Not legal advice. No secrets printed. Live collection remains OFF. No live charges, payouts, bank edits, or activation deploys performed.**

Live account: `acct_1UJwZZECWiUpELSP` (HAVKAR, IT, individual).  
Production status endpoint: `/api/payment-activation-status` on `havkar-app.vercel.app` / `havkar.online`.

## Executive verdict

**NO-GO for live customer card collection.**

Revolut EUR is attached as default and payout interval is **daily** (`delay_days=3`). That does **not** prove Connect, commissions, marketplace card capture, AI subscriptions, or webhook settlement automation are production-ready.

## Stripe account readiness (live MCP + Production probe)

| Check | Result | Verdict |
| --- | --- | --- |
| `charges_enabled` | true | PASS |
| `payouts_enabled` | true | PASS |
| Requirements currently/past due | empty | PASS |
| Capabilities `card_payments` / `transfers` | active | PASS |
| Production `STRIPE_SECRET_KEY` mode | **live** | PASS |
| `STRIPE_WEBHOOK_SECRET` configured | true | PASS |
| Default EUR bank | REVOLUT PAYMENTS UAB last4 `8455` | PASS (attached) |
| Bank `status` | **`new`** (not `verified`) | **BLOCKED** |
| Payout schedule | `daily`, `delay_days=3` | PASS (configured; not instant) |
| Recent payouts list | empty | FAIL for “settlement proven” |
| Live balance | available €0.73 + pending €0.73 (card) | informational |
| Connect connected accounts | **[]** | **BLOCKED** for seller Connect payouts |
| Live webhook | `we_1UK6rg…` → `https://havkar.online/api/stripe-webhook` | PASS (endpoint up) |
| Webhook events subscribed | **`checkout.session.completed` only** | **BLOCKED** for automated refund/dispute/payout |
| Unsigned webhook POST | `REAL_PAYMENTS_PAUSED` | PASS (gate holds) |
| `HAVKAR_REAL_PAYMENTS_ENABLED` | false | PASS (must stay until Owner arm) |
| `HAVKAR_STRIPE_LIVE_ENABLED` | false | PASS (must stay until Owner arm) |
| Customer-facing collection | **paused** | PASS |

## Monetized flow checklist

| Flow | Pricing / rule | Stripe money movement | Connect / payout to seller | Automated tests | Staging live charge | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Buy & Sell | 2% buyer + 3% seller | **No** Stripe Checkout path for marketplace orders | **Not implemented** (`application_fee` / `transfer_data` absent; Connect accounts empty) | Fee math PASS | Not run (no rail) | **FAIL / BLOCKED** for card; XLM quote path separate & gated |
| Services | 10% provider commission | Ledger only (`service_commission_entries.collection_state` default `uncollected`) | No automatic Stripe debit | Unit/SQL suite exists (local PG unavailable here) | N/A | **BLOCKED** as Stripe cash; cash/manual ≠ Stripe received |
| Jobs | Subscription UI | Gated / unsupported in Stellar + card pause; not a live Stripe subscription rail | N/A | Guarded as unsupported | Not run | **BLOCKED** |
| Events / Tickets | Ticket price → HAVKAR platform Checkout | Implemented when flags on; server builds `unit_amount`; webhook activates on `paid` + idempotent session id | No Connect; 100% to platform balance | Ticket settlement + dry-run PASS | Live charge **not** executed | **PASS** for code path under pause; **BLOCKED** until Owner arms + bank verified + webhook expansion |
| HAVKAR AI | Paid plans UI | `billingUnavailable()`; Play Billing not implemented | N/A | UI gate present | Not run | **BLOCKED** |
| Ads boost | Test-mode path on webhook | Separate test construct; not Owner live activation | N/A | Existing ads tests elsewhere | Not claimed | informational |

## Cash / manual Services commissions

| Rule | Evidence |
| --- | --- |
| Commission recorded as liability | `collection_state='uncollected'`, `settlement_channel` default `manual` |
| Automatic debit | **false** (`lib/havkar-fee-examples.cjs`, services helpers) |
| Must not be reported as Stripe balance | Confirmed — no Checkout/PaymentIntent creation for service commission collection in code |

Production table probe: no `service_commission_entries` rows returned in aggregate (empty or none). Event tickets paid count=1; marketplace intents settled count=1 (XLM path history — not proof of Stripe marketplace).

## Security / integrity (verified in code + tests)

| Control | Result |
| --- | --- |
| Live key blocked without `HAVKAR_STRIPE_LIVE_ENABLED=true` | PASS |
| Master pause without `HAVKAR_REAL_PAYMENTS_ENABLED=true` | PASS |
| Webhook signature required when collection armed | PASS (code path) |
| Unsigned webhook while paused | PASS (`REAL_PAYMENTS_PAUSED`) |
| Ticket activation requires `payment_status=paid` | PASS |
| Duplicate Checkout session activation refused | PASS (`isDuplicatePaidActivation`) |
| Client-side fee not trusted for ticket amount | Server uses event `unitPrice` for `unit_amount` | PASS |
| Idempotency on Checkout create | Present in create path comments/code | PASS (code) |
| No duplicate charging in paused dry-run | PASS (no `checkout.stripe.com` URL returned) |

## What was **not** verified (do not mark PASS)

- Successful live or testmode end-to-end card charge / failure / refund / dispute / payout reconciliation against Stripe Dashboard objects in this run (sandbox webhook list empty; no local `STRIPE_SECRET_KEY`; live charges forbidden).
- Revolut bank micro-deposit / verification completion (`status` still `new`).
- First successful automatic daily payout to Revolut.
- Stripe Tax registrations / Partita IVA publication (tax_id/vat_id flags true on account object; digits not exposed).
- Google Play Billing / App Store IAP for AI digital subscriptions.
- Stripe Connect Express/Standard onboarding UX + contracts.

## Compliant revenue path (when Owner later arms Events only)

1. Buyer pays Event Checkout → funds land on **HAVKAR platform Stripe balance** (minus Stripe fees).
2. Amount moves available → pending per Stripe card settlement.
3. With **daily** payout + `delay_days=3`, available EUR becomes eligible for scheduled payout to default Revolut …8455 **after** bank is `verified`.
4. Daily schedule ≠ instant bank credit.
5. Marketplace seller net and Services 10% do **not** automatically enter this path today.

## Exact remaining Owner blockers before any GO

1. Wait until Revolut external account `status=verified` (or confirm Stripe accepts payouts while `new` — currently treated as BLOCKED).
2. Expand live webhook events to include at least: `charge.refunded`, `charge.dispute.*`, `payout.paid`, `payout.failed` (handlers exist in `api/stripe-webhook.js` but are not subscribed).
3. Decide scope for first arming: **Events tickets only** (only implemented Stripe Checkout). Do not claim Buy & Sell / Services / Jobs / AI card rails.
4. Legal / tax / store compliance sign-off (IT individual account, product description currently event-ticket oriented, Play Billing for AI).
5. Explicit Owner approval + exact micro-charge amount before first live test payment.
6. Then set `HAVKAR_STRIPE_LIVE_ENABLED=true` and `HAVKAR_REAL_PAYMENTS_ENABLED=true` on Production and redeploy — **not done in this audit**.

## Changes made in this audit branch

- Rewrote `scripts/verify-stripe-live-readiness.mjs` for current Revolut/daily/live-key reality; still forces `live_activation_allowed=false` / **NO-GO**.
- Updated fee-example bank/payout notes in `lib/havkar-fee-examples.cjs`.
- Added this report.

## Deployment status

- Production payment flags: **still paused**.
- No activation deploy.
- No live webhook mutation performed (would require Owner-approved Stripe write).

## Final recommendation

**NO-GO** for production real-money activation.  
**PASS** only for: account charges/payouts enabled, live secret mode, Revolut attached as default, pause gates, Events Checkout code under pause, fee math, ticket settlement unit tests, production dry-run refusal.
