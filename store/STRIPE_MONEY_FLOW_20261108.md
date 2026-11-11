# Stripe money flow — verified architecture (8 November 2026)

Read-only Stripe MCP + repository inspection. **No secrets. No live charges.**

## Legal account / revenue owner

| Item | Evidence |
| --- | --- |
| Live Stripe account | `HAVKAR` / `acct_1UJwZZECWiUpELSP` |
| Business profile name | HAVKAR |
| Country | IT |
| Representative | Amir Jalilnia (individual business_type on Stripe) |
| Support address | Via Lucifero 40, 88900 Crotone KR, IT |
| Platform revenue destination today | **Same HAVKAR Stripe account** (no Connect destinations) |

## Payout bank

| Item | Value |
| --- | --- |
| Bank | POSTEMOBILE S.P.A. |
| Last4 | 0596 |
| Currency | EUR |
| Status | **new** (not `verified`) |
| Payout schedule | **manual**, delay_days 3 |
| Recent payouts API | empty list |
| Revolut Business | **Not attached** — do not delete PosteMobile until Revolut is added and verified |

### Revolut migration plan (owner)

1. Stripe Dashboard → Settings → Bank accounts → Add Revolut Business IBAN (EUR).
2. Complete Stripe verification for the new account.
3. Set Revolut as default for EUR only after status=`verified`.
4. Keep PosteMobile until first successful payout to Revolut succeeds.
5. Agent cannot perform these writes (MCP read-only).

## Stripe Connect

| Check | Result |
| --- | --- |
| `GET /v1/accounts` (connected accounts) | **[] empty** |
| `application_fee_amount` / `transfer_data` in Checkout code | **Absent** |
| Marketplace seller Connect payouts | **Not implemented** |

## Webhooks (live)

| Endpoint | Events | Code handler |
| --- | --- | --- |
| `https://havkar-app.vercel.app/api/stripe-webhook` | `checkout.session.completed` only | `api/stripe-webhook.js` (event tickets + ads boost test path) |

Missing for future Connect/refunds (not required for current ticket path): `charge.refunded`, `charge.dispute.*`, `payout.*`, `account.updated`. MCP is read-only — owner expands in Dashboard if needed.

## Production activation blockers (exact)

1. `STRIPE_SECRET_KEY` mode on Production = **unknown**
2. `HAVKAR_STRIPE_LIVE_ENABLED` unset
3. `HAVKAR_REAL_PAYMENTS_ENABLED` unset
4. Bank status `new`
5. Separate exact-amount confirmation before any real charge/payout
6. PR #133 review/merge

## Stream-by-stream reality

### A. Buy & Sell (2% buyer / 3% seller)

- Fee math: `havkar-marketplace.js`, `lib/stellar-checkout.cjs`
- Stripe Checkout for marketplace orders: **NOT implemented** (`market.html` has no Stripe Checkout path)
- Connect split to sellers: **NOT implemented**
- Today: fee display / XLM quote math only; no automatic card capture of platform fee

### B. Services (10% provider commission)

- DB enforces 1000 bps: migration `20261012231344_service_commission_and_accommodation_owner_tools.sql`
- Ledger: `service_commission_entries` with `collection_state` default **`uncollected`**
- Code comment + admin UI: commission is **liability**, not collected payment
- Cash path: acknowledgement fields exist; **no automatic debit** of provider
- Admin: `admin.html` reads ledger; does not mark collected as paid Stripe money

### C. Jobs (paid listings / subscriptions)

- UI exists; recurring XLM refused; Stripe subscription collection remains behind payment gates / unfinished live path
- Not an active live revenue rail while flags paused

### D. HAVKAR AI

- Server policy blocks free usable logo generation without paid plan (`supabase/functions/havkar-ai-assistant/policy.mjs`)
- Subscription Checkout status gated by real-payment pause
- Not live-collecting while flags off

### E. Events (only implemented Stripe Checkout gross capture)

- Code: `api/create-event-checkout.js` → `checkout.sessions.create` (full ticket amount to HAVKAR)
- Webhook marks `event_tickets` paid on `checkout.session.completed` with idempotency on session id
- No application fee; HAVKAR receives 100% of ticket price into Stripe balance (minus Stripe processing fees)

### F. Refunds / chargebacks / taxes / failures

- Refund webhook handlers for tickets: **not subscribed**
- Taxes: processing_fee/tax fields exist on commission ledger but stay zero until verified assessment
- Payment failures: Checkout cancel URL; pending tickets cleaned on Stripe create failure

## What happens to commissions €0.10 … €100

See calculator `lib/havkar-fee-examples.cjs` and table in Persian final report. Summary of **verified** behavior:

| Question | Verified answer |
| --- | --- |
| Does amount enter HAVKAR Stripe balance? | Only if collected via HAVKAR Checkout/PaymentIntent (today: event tickets when armed). Marketplace/service commissions do **not** auto-enter Stripe. |
| Who pays Stripe fees? | Platform account (HAVKAR) on direct charges |
| Available vs pending | Stripe standard settlement; live balance showed €0.73 available |
| Minimum payout | Not observed as fixed API field; schedule is **manual** |
| Accumulate small amounts? | Yes — remain in Stripe balance until owner creates a payout |
| When bank payout? | Only when owner initiates (manual schedule) |
| Which bank? | PosteMobile …0596 if payout succeeds while it remains default |
| Unverified bank / failed payout | Bank status `new`; payouts_enabled=true but verification risk remains |

## Fee viability (estimate)

EU card fee estimate used in code examples: **1.5% + €0.25** (not a live Stripe quote).  
Standalone collection of €0.10 or €0.50 as a separate charge is **not economically viable** under that estimate (fixed €0.25 fee alone exceeds commission). Batching into larger Checkout amounts or offline invoicing is required for tiny commissions.
