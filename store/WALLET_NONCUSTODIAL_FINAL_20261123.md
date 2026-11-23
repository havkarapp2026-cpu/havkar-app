# HAVKAR Wallet — non-custodial final architecture (23 November 2026)

Evidence-based. Not legal advice. No claim of SCF funding or regulatory exemption.

## Production baseline

- Prior commerce honesty: PR #269 / `6900988d`
- This release: branch `cursor/wallet-noncustodial-final-d4b2`

## Three-part wallet

| Section | Holds customer funds? | What it shows / does |
| --- | --- | --- |
| HAVKAR finance hub | No | Own Stripe/Connect settlements, commissions, receipts |
| Stellar non-custodial | No | User wallet connect; reviewable XDR; user signs; Horizon balance/history |
| Payment center | No | Links to Buy & Sell, Services, Jobs, Tickets, receipts |

## Asset & key control

| Asset | Legal/technical holder | Who signs |
| --- | --- | --- |
| Card / Connect fiat | Stripe / connected Express accounts | Stripe |
| XLM | User Stellar account (G…) | User wallet only |
| Internal `wallets` row | Ledger record only | Fiat deposit / withdraw / P2P OFF |

`havkar_can_unilaterally_move_xlm` = **false** (architecture API + source audit: no `fromSecret`).

## APIs

- `GET /api/finance?action=wallet_architecture` — public technical statement
- `GET /api/finance?action=stellar_metrics` — Owner-only SCF-style aggregates from settled intents with `tx_hash`
- `GET /api/finance?action=wallet_activity` — signed-in user’s commerce rows only

## Gated without licensed partner

- Internal fiat top-up / e-money balance
- Fiat withdrawal to IBAN
- Free P2P euro transfers
- HAVKAR-operated crypto exchange
- Unilateral Stellar send by HAVKAR
- Peer Mainnet send until Owner arms `stellar_mainnet_customer_live`

## SCF readiness (technical only)

- Non-custodial connector: yes
- Mainnet collection flag supported: yes
- Metrics endpoint: `stellar_metrics` (Owner)
- Claim of funding: **false**

## Regulatory notes (not exemptions)

- PSD2: PI/AIS/PIS may apply if HAVKAR initiates fiat payments as a payment institution
- MiCA: CASP may apply for crypto services for others; user-signed transfers still need counsel classification before public “transfer service” marketing
- Italy/EU: Banca d’Italia / EU EMI–PI–CASP assessment required for consumer-facing remittance or custody

## Money moved by this release

**None.** No new charge, XLM send, refund, or payout executed by the agent.
