# HAVKAR revenue & settlement architecture (9 November 2026)

No bank account numbers, IBAN, or BIC are stored in this repository.

## Public legal identity (allowed)

- Legal name: HAVKAR DI JALILNIA AMIR
- Operator: Amir Jalilnia
- Registration number (Revolut Business document 9 Nov 2026): KR234170
- Registered address: Francesco Antonio Lucifero 40, 88900 Crotone, Italy
- Partita IVA: **not published** until Visura confirms a VAT number

## Confidential settlement (Owner / Stripe Dashboard only)

- Intended EUR settlement bank: Revolut Bank UAB (Owner Revolut Business)
- IBAN/BIC: configure only inside Stripe payout settings / Revolut — never in frontend, staff UI, git, or staff reports
- Current live Stripe payout bank (11 Nov 2026 audit): Revolut Payments UAB …8455 is default EUR; status still `new` until Stripe verifies. Daily payout schedule configured (`delay_days=3`). See `store/STRIPE_PRODUCTION_READINESS_AUDIT_20261111.md`.

## Money flows (as implemented)

| Flow | Buyer pays | Provider/seller | HAVKAR commission | Auto EUR to Revolut |
| --- | --- | --- | --- | --- |
| Buy & Sell (XLM Mainnet) | Native XLM to merchant destination | Seller net after fee rules | Fee bps in quote | **No** — XLM ≠ EUR bank credit |
| Buy & Sell (Stripe) | Card Checkout (when armed) | Not Connect-split yet | Platform fee rules | Only after Stripe available balance + Owner payout |
| Services | Off-platform / ledger liability | Provider keeps agreed net | 10% ledger `uncollected` until collected | No automatic debit |
| Event tickets free | €0 | n/a | n/a | n/a |
| Event tickets paid (Stripe) | Card (when armed) | Event organizer (manual ops) | Platform Checkout | Same Stripe payout path |
| Event tickets XLM | Native XLM | Same merchant destination | Included in quote | No automatic EUR conversion |
| AI / Jobs subscriptions | Gated / paused for live cards | n/a | Plan entitlements | Stripe only when flags on |

## Accounting rules

1. Do not treat internal wallet rows as custodial user bank balances for regulated e-money.
2. Stellar Mainnet settlements are ledgered separately from EUR Revolut balances.
3. Owner finance RPC `havkar_owner_finance_ledger_summary` exposes counts only — never bank secrets.
4. Staff Workspace cannot read settlement bank fields.

## Stripe activation blockers (live)

1. Revolut bank `status` must be `verified` (attached alone is insufficient).
2. Expand webhook events beyond `checkout.session.completed` for refunds/disputes/payouts.
3. Marketplace Connect + Services automatic collection remain unimplemented — do not claim them.
4. Set `HAVKAR_STRIPE_LIVE_ENABLED=true` then `HAVKAR_REAL_PAYMENTS_ENABLED=true` only after Owner exact-amount approval (Production key mode already `live`).
