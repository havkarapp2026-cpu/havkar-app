# Stripe account audit — 8 November 2026

Superseded for live details by `store/STRIPE_LIVE_VERIFICATION_20261108.md` after the owner authorized **Live HAVKAR + Sandbox (read-only)**.

## MCP accounts (current)

| Account | stripe_context | livemode |
| --- | --- | --- |
| HAVKAR | `acct_1UJwZZECWiUpELSP` | **true** |
| HAVKAR-sandlåda | `acct_1UJwZzEAHNL6NCGl` | false |

## Live summary

- `charges_enabled=true`, `payouts_enabled=true`, requirements clear
- Webhook enabled to production for `checkout.session.completed`
- Payout bank: PosteMobile …0596 status `new` (Revolut not attached)
- Production collection still **paused**; secret key mode **unknown**

Full evidence and exact blockers: `store/STRIPE_LIVE_VERIFICATION_20261108.md`.
