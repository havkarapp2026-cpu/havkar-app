# HAVKAR Stellar — Duplicate warning at Review (2026-11-24)

## Observed issue (after PR #282 on production)

Owner re-entered the same LOBSTR→Albedo `0.01` XLM peer payment (empty memo). The **Review** panel opened, but no duplicate warning appeared. No new payment was confirmed or submitted.

## Root cause

1. **Stage:** The blocking `window.confirm` duplicate dialog ran only inside `confirmHAVKARStellarPayment` (Confirm · sign). `reviewHAVKARStellarPayment` did not surface any duplicate notice.
2. **Time window:** Horizon record `a78337d9…` landed at `2026-11-24T20:59:54Z`. At investigation time it was **~52 minutes** old — **outside** the 15-minute hard guard (`RECENT_SUCCESS_GUARD_MS`). Even Confirm would not have shown the blocking dialog.

So the missing banner at Review was a **UX gap**; for that specific retry the absence of a hard block was also **expected** after 15 minutes.

## Fix

- Review panel now calls `havkarFindPaymentDuplicateNotice`:
  - **guard** (within 15 minutes): orange warning banner + status; Confirm still shows `confirm()` before wallet open.
  - **info** (matching payment within 24h Horizon lookback / older local last-success): blue informational banner; does **not** auto-block.
- Hard submit guard, cross-tab lock, dual pending storage, hash-idempotent Horizon confirm, and explicit wallet approval are unchanged.
- No secret keys; no auto-sign; no Stripe changes.

## Limitation

Client-side + public Horizon history still cannot guarantee global exactly-once payments.
