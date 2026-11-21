# Owner actions — Stripe settlement + mobile release (10 Nov 2026)

No IBAN / secrets in this file.

## A) Revolut bank status `new`

Stripe Live shows Revolut …8455 as default EUR payout bank with status **`new`** (not `verified`).
Account `charges_enabled=true`, `payouts_enabled=true`, requirements empty.

**Cannot force-verify via API.** Typical next steps:

1. Stripe Dashboard → Settings → Bank accounts → confirm Revolut …8455 is default.
2. After first successful balance + Owner-approved payout, Stripe usually moves bank status to `verified`.
3. If Dashboard shows a document/microdeposit request, complete that identity/bank confirmation there.

## B) Expand Live webhook events (MCP write denied)

Endpoint `we_1UK6rgECWiUpELSPIQKXo4E9` currently has only `checkout.session.completed`.

In Stripe Dashboard → Developers → Webhooks → that endpoint → add:

- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.closed`
- `payout.paid`
- `payout.failed`

App code now applies refund/dispute ticket updates when these events arrive with `event_ticket_id` metadata.

## C) €1 live card test (not armed yet)

Proposed amount: **€1.00**. Do **not** arm until Owner replies with exact confirmation text, e.g.:

`APPROVE EUR 1.00 LIVE CARD TEST`

Then Owner (or agent after that message) sets on Vercel Production:

1. `HAVKAR_STRIPE_LIVE_ENABLED=true`
2. `HAVKAR_REAL_PAYMENTS_ENABLED=true`

Redeploy, run one ticket Checkout, then turn flags back off if desired.

## D) Android signed AAB

Agent GitHub token cannot `workflow_dispatch` (HTTP 403).

Owner: GitHub → Actions → **Android release AAB** → Run workflow → branch `main` → mode `signed`.

## E) iOS signed IPA

Latest failure: Cloud signing permission + no profiles.

Either:

1. Enable App Store Connect **cloud signing** for the ASC API key / team, **or**
2. Add repository secret `APPLE_PROVISIONING_PROFILE_BASE64` (App Store Distribution profile for `online.havkar.app`) and re-run **iOS Release** mode `signed_ipa` (workflow now prefers manual export when profile UUID is present).
