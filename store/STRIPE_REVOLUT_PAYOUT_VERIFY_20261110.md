# Stripe ↔ Revolut payout verification — 10 November 2026

Live account `acct_1UJwZZECWiUpELSP`. No IBAN printed.

## Payout bank (Live MCP retrieve)

| Field | Value |
| --- | --- |
| Bank name | REVOLUT PAYMENTS UAB |
| Country / currency | LT / EUR |
| Last4 | **8455** |
| Default for EUR | **true** |
| Status | `new` (not yet `verified`) |
| External accounts count | 1 (PosteMobile no longer present) |

## Account rails

| Field | Value |
| --- | --- |
| `charges_enabled` | true |
| `payouts_enabled` | true |
| Requirements currently/past due | empty |
| Payout schedule | manual, delay_days 3 |
| Connect connected accounts | none |

## Webhook

| Field | Value |
| --- | --- |
| Endpoint | `we_1UK6rgECWiUpELSPIQKXo4E9` → Production `/api/stripe-webhook` |
| Status | enabled |
| Events | `checkout.session.completed` only |
| App handlers for refund/dispute/payout | present in code; **not subscribed** on Live endpoint yet |

## App collection flags

Still **paused** (`HAVKAR_REAL_PAYMENTS_ENABLED` / `HAVKAR_STRIPE_LIVE_ENABLED` not true). No micro-charge executed — waiting for Owner exact amount + explicit permission.

## Partita IVA note from Stripe KYC

`company.tax_id_provided=true` and `company.vat_id_provided=true`, but Stripe API does **not** return the VAT digits. Partita IVA is **not published** until Owner supplies Visura (or another official document with the number).
