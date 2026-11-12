# Stripe Test Mode Readiness — 2026-11-11

Commit under review: `a1ba1040` (PR #154)  
Live charging: **OFF** (`HAVKAR_REAL_PAYMENTS_ENABLED=false`, `HAVKAR_STRIPE_LIVE_ENABLED=false`, `customer_facing_collection=paused`)

## Verdict

| Area | Result |
|------|--------|
| CI / merge readiness | **PASS** |
| Live flags stay OFF | **PASS** |
| Revolut EUR bank (`status=new`) | **PASS** (non-blocker; `payouts_enabled=true`) |
| Webhook subscription vs `REQUIRED_WEBHOOK_EVENTS` | **FAIL** |
| Stripe Test Mode config (sandbox webhook + secrets in Preview) | **FAIL** |
| Real Test Mode Checkout → webhook → ticket/QR → refund e2e | **BLOCKED** |
| Connect seller onboarding + Buy&Sell 2%/3% fee routing (live money) | **BLOCKED** (code/unit **PASS**; live Test Mode e2e not run) |
| Live activation / merge / deploy with flags ON | **NOT DONE** (intentionally) |

**Overall Test Mode readiness: NO-GO** until Owner completes Dashboard webhook steps and Test Mode secrets/e2e.

---

## Evidence — CI / PR

- Branch: `cursor/stripe-payments-settlement-audit-d4b2` @ `a1ba1040`
- PR: https://github.com/havkarapp2026-cpu/havkar-app/pull/154
- State: `OPEN`, `MERGEABLE`, `mergeStateStatus=CLEAN`
- Checks: Build AAB (unsigned_smoke), audit, Preflight, Vercel, Vercel Preview Comments → **SUCCESS** (Signed IPA / TestFlight skipped)

Automated unit tests re-run this session:

```
node --test tests/stripe-*.test.mjs tests/marketplace-connect.test.mjs \
  tests/service-commission-ledger.test.mjs tests/events-ticket-qr-flow.test.mjs
→ 22 pass / 0 fail
```

Marketplace fee unit proof (destination charge):

- list €100 → buyer +2% (€102) / seller −3% (€97) / `application_fee_amount` = 500 cents (5%)
- `charge_pattern: destination`

---

## Evidence — Live account (read-only MCP)

Account: `acct_1UJwZZECWiUpELSP` (HAVKAR, livemode=true)

Production `GET /api/payment-activation-status` (2026-11-11T19:38Z):

- `customer_facing_collection=paused`
- `secret_key_mode=live`
- `webhook_secret_configured=true`
- `live_collection_allowed=false`
- default EUR bank: Revolut `…8455`, LT, `status=new`, `payouts_enabled=true`, `charges_enabled=true`

Live webhook endpoint `we_1UK6rgECWiUpELSPIQKXo4E9`:

- URL: `https://havkar.online/api/stripe-webhook`
- status: `enabled`
- **subscribed:** only `checkout.session.completed`
- **missing (13):**  
  `checkout.session.async_payment_succeeded`,  
  `checkout.session.async_payment_failed`,  
  `checkout.session.expired`,  
  `payment_intent.payment_failed`,  
  `charge.refunded`,  
  `charge.dispute.created`,  
  `charge.dispute.updated`,  
  `charge.dispute.closed`,  
  `payout.created`,  
  `payout.paid`,  
  `payout.failed`,  
  `account.updated`,  
  `account.external_account.updated`

Agent attempted `PostWebhookEndpointsWebhookEndpoint` to expand events → **Unauthorized** (Stripe MCP write scope). Dashboard update required.

---

## Evidence — Test Mode / sandbox (read-only MCP)

Account: `acct_1UJwZzEAHNL6NCGl` (HAVKAR-sandlåda, livemode=false)

- Webhook endpoints: **`[]` (none)**
- Connected accounts present but incomplete:
  - `acct_1UJwkBEAHNQlJny9` Express-style controller — `charges_enabled=false`, `payouts_enabled=false`, requirements past_due
  - `acct_1UJwkBEAHN4Dy9bZ` Standard — bank test attached, still `charges_enabled=false`, requirements past_due

Agent attempted:

- `PostWebhookEndpoints` (Test Mode) → **Unauthorized** then MCP auth drop
- `PostCheckoutSessions` (Test Mode €5 Events ticket) → **Unauthorized** / auth required

Agent environment secrets:

- `STRIPE_SECRET_KEY` / `STRIPE_TEST_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` → **absent**
- `HAVKAR_STRIPE_TEST_CHECKOUT_ENABLED` → **absent/false**

Preview deploy `a1ba1040` (`havkar-dcj08f8fg-…vercel.app`):

- `stripe.secret_key_mode=missing`
- `webhook_secret_configured=false`
- `test_checkout_allowed=false`
- `marketplace_connect.implemented=true`, `live_armed=false`, buyer 200 bps / seller 300 bps

Therefore real Test Mode Checkout / webhook delivery / ticket activation / refund / Connect destination charge **was not executed**. Not marked PASS.

---

## Owner actions (Dashboard only — no live charge)

### 1) Expand **Live** webhook events (required before any live arming)

1. Open Stripe Dashboard → **Live** → Developers → Webhooks  
2. Open endpoint `we_1UK6rg…` → `https://havkar.online/api/stripe-webhook`  
3. Update events to **exactly** these 14:

```
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
payment_intent.payment_failed
charge.refunded
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
payout.created
payout.paid
payout.failed
account.updated
account.external_account.updated
```

4. Do **not** enable live collection flags after this step alone.

### 2) Create **Test Mode** webhook (required for Test e2e)

1. Stripe Dashboard → toggle **Test mode** → Developers → Webhooks → Add endpoint  
2. URL:

```
https://havkar.online/api/stripe-webhook
```

(Or Preview URL if testing Preview only — then set that Preview’s `STRIPE_WEBHOOK_SECRET`.)  
3. Enable the same 14 events listed above.  
4. Copy the endpoint **Signing secret** (`whsec_…`) into the env that will receive Test Mode events (Production already has a live `whsec`; Test Mode needs a matching secret for the Test endpoint, or a dual-secret verifier if both hit the same URL).

### 3) Arm Test Mode Checkout **without** live

On Preview (preferred) or a dedicated Test env:

- `STRIPE_SECRET_KEY=sk_test_…`
- `STRIPE_WEBHOOK_SECRET=whsec_…` (Test endpoint)
- `HAVKAR_STRIPE_TEST_CHECKOUT_ENABLED=true`
- Keep `HAVKAR_REAL_PAYMENTS_ENABLED=false` and `HAVKAR_STRIPE_LIVE_ENABLED=false`

Then re-run agent Test Mode e2e (or Owner Dashboard: pay with `4242…`, confirm webhook, ticket QR, refund).

### 4) Connect Test Mode seller

Complete onboarding for an Express connected account in Test Mode until `charges_enabled=true`, then create one destination Checkout (€100 list → €102 charge / €5 application fee / €97 to seller) and confirm settlement events.

### 5) MCP write permission (optional)

Stripe MCP session can **read** but write returns **Unauthorized**. If Owner wants agent-driven webhook/Checkout updates: reopen Stripe MCP account permissions (write) via Dashboard connect flow, then ask agent to retry.

---

## Explicit non-claims

- No live charge, transfer, payout, or refund was performed.
- No merge to `main` and no Production flag arming was done.
- Full payment → webhook → ticket/QR → refund path is **BLOCKED**, not PASS.
- Code + unit coverage for fees/webhooks/QR is PASS; that is not a substitute for Stripe Test Mode e2e.
