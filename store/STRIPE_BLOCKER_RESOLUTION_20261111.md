# Stripe production blocker resolution — 11 November 2026

Continues PR #154. **Live collection remains OFF.** No live charges, refunds, transfers, payouts, or Revolut bank edits.

## 1) PR #154 status

| Item | Result |
| --- | --- |
| CI checks | **PASS** (7/7 green on `274e32a6`) |
| Human review comments requiring code fixes | **None** |
| Vercel Preview | Ready |
| Mergeable | **MERGEABLE / CLEAN** |
| Merge readiness | Ready to merge as audit+implementation branch after this follow-up commit; **does not** authorize Production payment activation |

## 2) Revolut `status=new` investigation

| Evidence | Finding |
| --- | --- |
| Stripe API external account docs | For payout banks, `new` = no validation activity yet |
| Blocking statuses | `errored`, `verification_failed`, `tokenized_account_number_deactivated` |
| Live account | `payouts_enabled=true`, Revolut default EUR …8455, bank requirements empty, `available_payout_methods=["standard"]` |
| Verdict | **`status=new` is NOT a verification blocker** for scheduled payouts |

Updated readiness tooling accordingly (`lib/stripe-bank-status.cjs`).

## 3) Webhooks

Implemented secure processing path:

- Signature verification via `constructEvent`
- Idempotency via `stripe_webhook_events` PK insert
- Success: `checkout.session.completed` / `async_payment_succeeded` → paid + valid ticket
- Failure: `async_payment_failed` / `expired` / `payment_intent.payment_failed`
- Refunds/disputes: charge.* handlers
- Payout lifecycle: recorded in `stripe_payout_events`
- Unit tests with Stripe test header generation: **PASS**

**Owner action still required (Dashboard):** expand live endpoint `we_1UK6rg…` enabled_events to `REQUIRED_WEBHOOK_EVENTS` listed by `/api/payment-activation-status` (code cannot mutate live webhook without Owner-approved Stripe write; MCP write Unauthorized in this session).

## 4) Events / Tickets + QR

| Step | Status |
| --- | --- |
| Server Checkout create (idempotent) | Code **PASS** (gated) |
| Webhook paid → ticket valid | Unit **PASS** |
| QR from `ticket_code` in `events.html` (`HAVKAR:` + code) | Code **PASS** |
| Stripe Test Mode end-to-end charge against sandbox API | **BLOCKED** — sandbox MCP write Unauthorized; no local `STRIPE_SECRET_KEY` |

Test path prepared: set `HAVKAR_STRIPE_TEST_CHECKOUT_ENABLED=true` with `sk_test_…` only (never live key). Live flags stay false.

## 5) Buy & Sell Connect (2%/3%)

| Item | Status |
| --- | --- |
| Fee routing math | **PASS** (buyer 102 / seller 97 / fee 5 on €100) |
| Destination Checkout params | **PASS** (`application_fee_amount` + `transfer_data.destination`) |
| Accounts v2 recipient onboarding payload + Account Link API route | Implemented via `havkarAction=marketplaceConnect` |
| Live Connect accounts on Production | Still **none** — onboarding not executed live |
| Live activation | **OFF** |

## 6) Services 10%

| Item | Status |
| --- | --- |
| Cash/uncollected ≠ Stripe cash | **PASS** (`lib/service-commission-ledger.cjs` + tests) |
| Automatic Stripe debit | Still **not implemented** (correct) |

## 7) Jobs / HAVKAR AI remaining blockers

| Flow | Blocker |
| --- | --- |
| Jobs subscriptions | No Stripe Billing subscription Checkout; XLM recurring refused; UI still subscription-oriented |
| HAVKAR AI | `billingUnavailable()`; Play Billing / App Store IAP not implemented; digital entitlement must not sell via one-time XLM |

Preserve pricing/entitlement gates until store billing exists.

## 8) Tests run (this commit)

```
node --test tests/stripe-bank-status.test.mjs tests/marketplace-connect.test.mjs \
  tests/service-commission-ledger.test.mjs tests/stripe-webhook-processor.test.mjs \
  tests/havkar-fee-examples.test.mjs tests/stripe-ticket-settlement.test.mjs \
  tests/real-payments-pause.test.mjs tests/stripe-secret-mode.test.mjs \
  tests/stripe-card-path-dry-run.test.mjs tests/stripe-live-readiness.test.mjs \
  tests/events-ticket-qr-flow.test.mjs
```

Result: **22+ related tests PASS** (see `/opt/cursor/artifacts/stripe-blocker-resolution-tests.log`).

## 9) Deployment / flags

| Flag | Production |
| --- | --- |
| `HAVKAR_STRIPE_LIVE_ENABLED` | **false** |
| `HAVKAR_REAL_PAYMENTS_ENABLED` | **false** |
| Customer collection | **paused** |
| Migration applied to Supabase prod project | `stripe_payout_events` + `marketplace_seller_connect_accounts` |

## Exact remaining Owner actions

1. In Stripe Dashboard → Webhooks → production endpoint → add events from `REQUIRED_WEBHOOK_EVENTS`.
2. Optionally run local/staging Test Mode with `sk_test` + `HAVKAR_STRIPE_TEST_CHECKOUT_ENABLED=true` to complete a real test card Checkout + QR check-in.
3. Complete seller Connect onboarding in Test Mode before claiming marketplace card payouts.
4. After legal checklist + exact micro-charge amount: set live flags (not done by agent).
5. Do **not** treat Services cash commissions as Stripe balance.

## Final recommendation

**NO-GO for live customer charging.**  
Technical blockers for bank `status=new` are **cleared**. Remaining blockers: live webhook event subscription expansion, Test Mode charge e2e (environment), Jobs/AI store billing, Owner activation approval.
