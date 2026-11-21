# Seller Stripe Connect — activation steps (technical)

Branch: `cursor/buysell-public-ready-d4b2`  
No live charge / merge / deploy without Owner approval.

## Seller path (UI)

1. Sign in on Buy & Sell (`buy-sell.html`) or open own listing (`ad-details.html`).
2. Open **Seller payout setup** → **Start / continue Stripe Connect** (or listing owner button).
3. Complete Stripe-hosted KYC/KYB + bank account.
4. Return to `buy-sell.html?connect=return` → Refresh status until `charges_enabled=true`.
5. Optional XLM: Wallet → save Stellar receive **public** key only.

## Server path

- Status: `POST /api/create-event-checkout` `{ action: "marketplace_connect_status" }`
- Onboard: `{ action: "marketplace_connect_onboard" }` → Accounts v2 + Account Link
- Webhook `account.updated` updates `marketplace_seller_connect_accounts`
- Buy Now requires seller `charges_enabled` + `HAVKAR_MARKETPLACE_PUBLIC_LIVE_PAYMENTS=true` + card live gates

## Fees (destination charge)

List €100 → charge €102 (`application_fee` €5) → seller transfer €97.

## Owner-only before first real card sale

1. Confirm Stripe Dashboard webhook endpoint lists all `REQUIRED_WEBHOOK_EVENTS` (incl. refund/dispute/account.updated).
2. At least one seller with `charges_enabled=true`.
3. Counsel sign-off on Terms fees/refunds draft.
4. Explicit approval to set `HAVKAR_MARKETPLACE_PUBLIC_LIVE_PAYMENTS=true`.
5. Explicit approval for merge + production deploy + first live € charge.
