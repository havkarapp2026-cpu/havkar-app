# HAVKAR Stripe staging final completion — 2026-11-12

## Correct destination (identified)

| Item | Value |
| --- | --- |
| Sandbox account | `acct_1UJwZzEAHNL6NCGl` (HAVKAR-sandlåda) |
| Correct staging webhook | `we_1UawCfEAHNL6NCGlIEajIIcv` |
| Name/description | HAVKAR-Sandbox-Staging / staging payout tests only |
| URL | `https://staging.havkar.online/api/stripe-webhook` |
| Enabled events | `payout.paid`, `payout.failed` |
| Status | enabled, livemode=false |

**Not the staging target:** `we_1Uav2VECWiUpELSPbcU0mpHP` (Live-account Test Mode / wrong context).

## Branch / deploy

| Item | Value |
| --- | --- |
| Branch | `cursor/stripe-test-mode-staging-d4b2` |
| Commit | `95526654216331d09177714577898b250afb4fa2` |
| Latest READY Preview | `dpl_3Qr99kJ4uDbTzzwvN5KsPHhwnwC9` |
| Alias | `staging.havkar.online` → that deploy |

## Preview env scopes (presence only; values not printed)

Branch-scoped Preview (`cursor/stripe-test-mode-staging-d4b2`):

- `STRIPE_SECRET_KEY` (sensitive) — present; runtime `secret_key_mode=test`
- `STRIPE_WEBHOOK_SECRET` (sensitive) — present; updated after sandbox webhook create
- `SUPABASE_URL` = staging `https://keglioewbkgdabsizvys.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` (sensitive) — present
- `HAVKAR_STRIPE_TEST_CHECKOUT_ENABLED=true`
- `HAVKAR_REAL_PAYMENTS_ENABLED=false`
- `HAVKAR_STRIPE_LIVE_ENABLED=false`

## Runtime / app-side

- Lazy Stripe init + staging isolation: `lib/stripe-runtime.cjs`, `api/stripe-webhook.js`
- Signature verification via `constructEvent`
- Idempotent ledger insert (`23505` → duplicate)
- Staging refuses livemode events
- Payout handler records `stripe_payout_events`
- GET webhook → 405; invalid signature → 400

## Automated tests

`node --test` (stripe-runtime-isolation, real-payments-pause, stripe-ticket-settlement, stripe-live-readiness, events-ticket-qr-flow): **12/12 PASS**

## Real Stripe platform delivery

**Not completed.** Stripe MCP **write** remains Unauthorized after repeated Owner “Connected Stripe” (read-only OAuth). Agent cannot:

- create sandbox customers/payouts
- trigger `payout.paid`
- rotate/retrieve endpoint signing secret via API

Preview `STRIPE_WEBHOOK_SECRET` is sensitive and not decryptable to the agent, so matching HMAC re-sign against the rotated Dashboard secret is also unavailable without write or secret read.

## Production

- Untouched; `secret_key_mode=live`, REAL/LIVE false, collection paused
- Production webhook ledger count remains 1

## Single required Owner action

Grant Stripe MCP **write** for sandbox `acct_1UJwZzEAHNL6NCGl` via reconsent (not read-only Connect), then agent can trigger Test Mode `payout.paid` to `we_1UawCf…` and verify HTTP 200 + staging ledger.
