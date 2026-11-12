# HAVKAR Stripe staging final completion — 2026-11-12

## Result: delivery NOT PASS (account mismatch proven)

| Item | Value |
| --- | --- |
| Branch | `cursor/stripe-test-mode-staging-d4b2` |
| Commit | `9bd053ab3d73cb9b4df692a54125ca6e24890332` |
| Deploy | `dpl_9QNrsaxxQr3NJ67gGZ7MJBEjan7K` READY → `staging.havkar.online` |
| Sandbox webhook | `we_1UawCfEAHNL6NCGlIEajIIcv` on `acct_1UJwZzEAHNL6NCGl` |
| Preview key account (resolved) | `acct_1UJwZZECWiUpELSP` (**mismatch**) |
| Stripe-originated `payout.paid` | **NOT verified** |
| Production | unchanged; live payments OFF |

## What was executed

1. Identified correct sandbox destination `we_1UawCf…` (not Live-test `we_1Uav2V…`).
2. Added staging-only e2e trigger via multiplexed checkout API (`/api/stripe-sandbox-payout-e2e`) using Preview `sk_test` — no new Hobby function, no MCP write, no secret exposure.
3. Trigger call funded a PaymentIntent whose id fragment matched Live account (`…ECWiUpELSP…`), then returned `INSUFFICIENT_TEST_BALANCE` (balance lag on wrong account).
4. Fail-closed account check now returns `STRIPE_ACCOUNT_MISMATCH` with:
   - `stripe_account_id=acct_1UJwZZECWiUpELSP`
   - `expected_sandbox_account_id=acct_1UJwZzEAHNL6NCGl`
5. Automated tests: **14+/12+ PASS** (sandbox e2e gates + runtime isolation + settlement).
6. Invalid webhook signature still **HTTP 400**.

## Exact external blocker (single action)

Preview branch `STRIPE_SECRET_KEY` is the **Live account** Test Mode key (`acct_1UJwZZECWiUpELSP`), but the staging webhook lives on sandbox **HAVKAR-sandlåda** (`acct_1UJwZzEAHNL6NCGl` / `we_1UawCf…`).

In Vercel → Project → Environment Variables → **Preview** → git branch `cursor/stripe-test-mode-staging-d4b2` only:

1. Set `STRIPE_SECRET_KEY` to the **sandbox** `sk_test` from Dashboard → Sandboxes → HAVKAR-sandlåda → API keys.
2. Keep `STRIPE_WEBHOOK_SECRET` as the signing secret for `we_1UawCf…` (do not rotate unless mismatched).
3. Redeploy that Preview branch.

Do **not** paste keys into chat. Do **not** change Production envs or live payments.

After that redeploy, agent can re-run `/api/stripe-sandbox-payout-e2e` and verify Stripe-originated `payout.paid` → HTTP 200 + staging ledger.
