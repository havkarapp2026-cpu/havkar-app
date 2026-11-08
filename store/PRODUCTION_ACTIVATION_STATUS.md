# HAVKAR — Production activation status (8 November 2026, final execution)

Owner authorized preparation/activation **after verified eligibility**.  
No fabricated live approvals. No irreversible charges without separate exact-amount confirmation. No auto-merge.

## A. Stripe live readiness

| Status | Detail |
| --- | --- |
| **RED — BLOCKED** | Stripe MCP session still has only sandbox `HAVKAR-sandlåda` (`livemode=false`) |
| Evidence | `list_available_accounts_or_orgs` returned one account; live `HAVKAR` absent |
| Webhook write | MCP `PostWebhookEndpoints` → Unauthorized |
| Revolut payout | Not verifiable until live account is connected |
| Production collection | Still `paused` / `REAL_PAYMENTS_PAUSED` |

One unblock action: authorize live HAVKAR in Stripe MCP using the URL in `store/STRIPE_ACCOUNT_AUDIT_20261108.md`.

## Actually activated now

| Rail | Activated? | Evidence |
| --- | --- | --- |
| Stripe live customer collection | **NO** | MCP sandbox-only; master flag unset |
| Stripe sandbox engineering | usable for tests | Sandbox charges/payouts enabled |
| Pi | **NO** | Individually disabled |
| Trade | **NO** | Individually disabled |
| Stellar Mainnet payments | **NO** | Source `STELLAR_MAINNET_PAYMENTS_ENABLED = false` |
| Stellar Testnet quote/verify | plumbing ON | Destination configured |
| Google Play production worldwide | **NO** | Closed testing / 12+14 rules not claimed complete |
| SCF #46 official submit | **NO** | Package ready; owner must submit |

## GREEN — completed and verified this pass

- Per-provider gates in `lib/real-payments.cjs` (Stripe / Pi / Trade)
- Stronger Stripe secret-mode detection (trim/quotes; reject publishable-as-secret)
- Pause + live-secret double gate for Stripe
- EUR/USD allow-list; event tickets remain EUR-priced
- Checkout idempotency + webhook signature / replay protection
- Commission rules preserved (market 2%/3%, services 10%)
- SCF #46 deadline re-verified: **9 November 2026** (timezone not published)
- SCF submission-ready paste package: `docs/scf/SCF46-SUBMISSION-READY.md`
- Horizon Mainnet evidence re-verified
- Stripe live readiness script: `scripts/verify-stripe-live-readiness.mjs`
- PR #133 open, not auto-merged

## YELLOW — prepared, awaiting owner / external

1. Connect **live** Stripe account to Stripe MCP (URL in audit doc)
2. Confirm/replace Production `STRIPE_SECRET_KEY` so mode is `live` or intentional `test` (currently reports `unknown`)
3. Create live webhook endpoint + put signing secret only in Vercel
4. Review & approve merge of PR #133
5. SCF invitation email + Submit on official portal
6. Separate confirmation for first exact live charge amount
7. Play Console closed testing ≥12 testers / ≥14 days

## RED — confirmed blockers

- Live Stripe eligibility **not verified** (sandbox only in MCP)
- Sandbox webhook create via MCP **Unauthorized**; live webhooks not created
- Production collection remains paused
- Revolut Business bank details for Stripe payouts **not verified**
- SCF full proposal not submitted (and cannot be without invitation URL)
