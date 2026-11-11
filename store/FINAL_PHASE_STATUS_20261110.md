# HAVKAR final phase status — 10 November 2026

Production baseline commit: `f28e5820`  
Stripe Live re-audited after Owner MCP reconnect (same session evidence).

## Phase 1 — Revolut + Stripe (evidence)

| Check | Result |
| --- | --- |
| Default EUR bank | REVOLUT PAYMENTS UAB · last4 **8455** · `default_for_currency=true` |
| External accounts | **1** (no duplicate reconnect) |
| `charges_enabled` | true |
| `payouts_enabled` | true |
| Account requirements currently/past due | empty |
| Individual verification | verified |
| Bank status | **`new`** (not `verified`) — cannot force via API |
| Payout schedule | manual · delay_days 3 |
| Available balance | 0.73 EUR |
| Live webhook `we_1UK6rgECWiUpELSPIQKXo4E9` | enabled → Production `/api/stripe-webhook` |
| Webhook events | **only** `checkout.session.completed` |
| Expand refund/dispute/payout events via MCP write | **Unauthorized** (read works; write denied) |

App settlement handlers for refund/dispute/payout already in `api/stripe-webhook.js` (await Dashboard subscription).

### Phase 1 Owner action (exact)

1. Stripe Dashboard → Developers → Webhooks → endpoint above → enable:
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.closed`
   - `payout.paid`
   - `payout.failed`
2. Bank status `new`: after first Owner-approved payout (or Dashboard bank confirmation prompt), re-check until status becomes `verified`. Do **not** add a second bank.

## Phase 2 — Real card payments (prepared, not charged)

| Check | Result |
| --- | --- |
| Live secret mode in Production | `live` |
| Public collection | **paused** (`HAVKAR_REAL_PAYMENTS_ENABLED=false`, `HAVKAR_STRIPE_LIVE_ENABLED=false`) |
| Unauth checkout | HTTP 401 |
| Unsigned webhook | HTTP 403 `REAL_PAYMENTS_PAUSED` |
| Dry-run tests | PASS |
| Proposed controlled charge | **EUR 1.00** |
| Charge executed | **No** — waiting Owner approval |

### Phase 2 Owner approval text (required before any charge)

Reply exactly:

```text
APPROVE EUR 1.00 LIVE CARD TEST
```

Only after that message may Production flags be set and one Checkout for €1 run.

## Phase 3 — Mobile release

| Item | Status |
| --- | --- |
| Agent `workflow_dispatch` | HTTP **403** (GitHub App token lacks Actions write) |
| Fresh signed AAB this run | Not produced by agent |
| Fresh signed IPA this run | Not produced by agent |
| Store submission | Not performed |

### Phase 3 Owner actions

1. GitHub → Actions → **Android release AAB** → `main` → mode `signed`
2. Add `APPLE_PROVISIONING_PROFILE_BASE64` **or** enable ASC cloud signing → **iOS Release** → `signed_ipa`
3. Upload artifacts in Play Console / App Store Connect; report review IDs
