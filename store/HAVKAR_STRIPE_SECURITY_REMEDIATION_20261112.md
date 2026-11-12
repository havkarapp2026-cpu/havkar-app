# HAVKAR Stripe Security Remediation & Go-Live Status — 2026-11-12

## Security warnings
A. Raw PAN submission (`req_oetkSnhnOZsXmY`): caused by a transient staging e2e attempt that sent test card numbers via `payment_method_data`. **Removed from code.** Current funding uses `pm_card_bypassPendingInternational` / `pm_card_visa` / `pm_card_chargeDeclined` only. Regression test: `tests/stripe-no-raw-card-security.test.mjs`.
B. Deprecated Charges/tokens: transient `charges.create({ source: tok_bypassPending })` attempt removed after Stripe EOL. No `charges.create` / `tok_*` remain under `api/` + `lib/` + `scripts/`.

## Account alignment
- Preview/staging branch `cursor/stripe-test-mode-staging-d4b2`: sandbox `acct_1UJwZzEAHNL6NCGl`, webhook `we_1UawCf…` → `staging.havkar.online/api/stripe-webhook`
- Production: Live `acct_1UJwZZECWiUpELSP`, webhook `we_1UK6rg…` → `havkar.online/api/stripe-webhook`, `secret_key_mode=live`

## Genuine sandbox tests (verified)
- payout.paid E2E HTTP 200 + ledger row for `evt_1Ub1YNEAHNL6NCGlOxktz52q` / `po_1Ub1YNEAHNL6NCGleOoQEdWL`
- No duplicate stripe_event_id rows
- Expanded scenarios added: payment_success / payment_fail / refund (PaymentMethods helpers only)

## Production activation
- Flags currently armed from prior Owner-authorized go-live: REAL=true, LIVE=true
- Controlled real-money smoke test: **NOT executed** this run — requires explicit Owner amount approval per policy
