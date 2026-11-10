# HAVKAR Stripe payment security audit — 10 November 2026

Public card gates remain **paused**. No additional live charges/refunds/payouts were initiated.

## Verified EUR 1.00 Owner Checkout (Stripe Live API)

| Field | Evidence |
| --- | --- |
| Checkout Session | `cs_live_a1ijbbAlu…WPnSH` (truncated in ops notes; full id in Stripe Dashboard) |
| Amount | `100` cents · `eur` |
| `payment_status` / `status` | `paid` / `complete` |
| `livemode` | `true` |
| Metadata | `havkar_owner_micro_test=true`, `amount_eur=1.00` |
| PaymentIntent | `pi_3Ua6DsECWiUpELSP1V4T6Mqr` · `status=succeeded` · `amount_received=100` |
| Charge | `ch_3Ua6DsECWiUpELSP1mrdV81G` · `paid=true` · `captured` · `amount_refunded=0` · PM type Link |
| Statement descriptor | `HAVKAR` |
| Success URL host | `https://havkar.online/owner-eur1-checkout.html` |
| Event | `evt_1Ua6E1ECWiUpELSPhjQiUCB0` (`checkout.session.completed`, `pending_webhooks: 1` at audit time) |

Client return page paid/complete is **corroborated** by Stripe. Secrets / client_secret values are not published here.

## Webhook / settlement findings

| Check | Result |
| --- | --- |
| Live endpoint id | `we_1UK6rgECWiUpELSPIQKXo4E9` |
| Endpoint URL | `https://havkar-app.vercel.app/api/stripe-webhook` |
| Risk | Production **308-redirects** POST `havkar-app.vercel.app/api/stripe-webhook` → `https://havkar.online/api/stripe-webhook` (verified by curl). Stripe webhook delivery generally does **not** follow redirects → delivery stuck. |
| Direct apex probe | Unsigned POST `https://havkar.online/api/stripe-webhook` → `403 REAL_PAYMENTS_PAUSED` (pre-fix) / after fix still requires signature for processing |
| Enabled events | **only** `checkout.session.completed` |
| Missing events | refund / dispute.* / payout.* (handlers exist in app; Dashboard not subscribed) |
| Pre-fix pause gate | Signed live webhooks returned `403 REAL_PAYMENTS_PAUSED` while public collection paused → contributes to `pending_webhooks: 1` |
| EUR1 event re-check | `evt_1Ua6E1…` still `pending_webhooks: 1` after PI/charge success (settlement not confirmed delivered) |
| Related open PRs (not merged) | #40 job Stripe checkout; #44 Jobs/Services prep without activation; #134 Buy&Sell filters |
| Signature path | `constructEvent` + raw body (`bodyParser: false`) present |
| Durable event ledger | **No** `stripe_events` idempotency table; ticket activation uses row-level duplicate guard only |
| Connect accounts | **none** (`GetAccounts` empty) |

### Safe fix shipped this audit
- Signed Stripe webhooks are processed even while public Checkout creation remains paused.
- Owner micro-test sessions without `event_ticket_id` are acknowledged explicitly.

### Owner actions still required
1. Stripe Dashboard → Webhooks → set URL to `https://havkar.online/api/stripe-webhook` (avoid redirect host).
2. Enable: `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `payout.created`, `payout.paid`, `payout.failed`.
3. Re-deliver `checkout.session.completed` for the EUR1 event if Dashboard still shows failed attempts.

## Payout / bank (re-checked Live)

| Field | Result |
| --- | --- |
| Default EUR bank | REVOLUT PAYMENTS UAB · last4 **8455** · `default_for_currency=true` · sole external account |
| Bank status | still **`new`** (not `verified`) |
| `charges_enabled` / `payouts_enabled` | true / true |
| Payout schedule | **manual**, delay_days 3 |
| Balance (audit moment) | available `0.73` EUR + pending `0.73` EUR card |
| Connect | not used |

## Payment-flow readiness matrix

| Flow | Fee rules in code | End-to-end Stripe Checkout | Connect/transfers | Webhook settle | Public gate | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Owner EUR1 micro-test | N/A (fixed €1) | PASS (Live) | N/A | PARTIAL (event pending; pause-gate previously blocked) | Owner-only bypass | **PASS for path proof** · not a product |
| Event tickets (Stripe) | Ticket price to HAVKAR | Implemented behind pause | No Connect | Implemented + duplicate guard | paused | **BLOCKED** (gates + webhook URL/events) |
| Event tickets (XLM Mainnet) | Separate Stellar rail | N/A Stripe | N/A | Horizon verify | armed separately | **OUT OF SCOPE** of card activation |
| Buy & Sell marketplace | Buyer 2% / seller 3% math | **NOT implemented** (`stripe_connect_used:false`) | none | none | paused | **FAIL / not built** |
| Services | Provider 10% ledger | Liability ledger only; `uncollected` | none | none | paused | **FAIL / not collected** |
| Jobs | — | No dedicated Stripe Checkout path found | none | none | paused | **FAIL / not built** |
| AI subscriptions | Staging/billing branches exist | Not verified as Live Production card path in this audit | — | — | paused | **BLOCKED / unverified Live** |
| Ads boost | Test-mode path on shared webhook | Test mode only | — | test secret path | test | **PASS test-mode only** |
| Wallet fiat send/withdraw | Client flags false | Disabled | — | — | off | **PASS (correctly off)** |
| Pi / trade crypto | Feature flags default off | gated | — | — | off | **PASS (correctly off)** |

## Security findings

| Area | Finding | Severity |
| --- | --- | --- |
| Public collection flags | Production `HAVKAR_REAL_PAYMENTS_ENABLED=false`, `HAVKAR_STRIPE_LIVE_ENABLED=false` | Expected / keep |
| Checkout price trust | Event Checkout creates pending ticket server-side then charges that amount | OK when armed |
| Client fee manipulation (marketplace) | Fees are display math only; no server Checkout to abuse yet | Latent until marketplace ships |
| Webhook signature | Required for live processing | OK |
| Webhook pause gate (pre-fix) | Blocked signed deliveries | Fixed in code this audit |
| Webhook endpoint host | vercel.app behind apex 308 | **High** until Owner moves URL |
| Secrets | No service_role / sk_live in frontend config | OK |
| RLS / Owner-Staff | Owner finance RPCs + event ticket RLS migrations present; not fully re-proven via live SQL in this run | Partial |
| Connect onboarding | Empty connected accounts | Marketplace/services cannot settle to sellers |

## Go / No-Go for public payment activation

**NO-GO for public live card activation.**

Reasons:
1. Marketplace / Services / Jobs card rails are incomplete.
2. Webhook endpoint still points at redirecting `vercel.app` host; settlement event set incomplete.
3. Revolut bank remains `new` (not verified) and payouts are manual.
4. No durable Stripe event ledger.
5. Owner EUR1 proves Checkout + Live keys only — not full product settlement.

After Owner completes webhook URL + event subscriptions, re-verify delivery for the EUR1 event, then decide per-product arming (tickets first) under explicit written approval.
