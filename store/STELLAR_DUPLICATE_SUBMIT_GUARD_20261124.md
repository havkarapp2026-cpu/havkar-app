# HAVKAR Stellar — Duplicate Submit Guard (2026-11-24)

## Goal

Harden non-custodial peer XLM sends so a delayed signature, repeated tap, retry, refresh, or WalletConnect reconnect cannot accidentally submit the same signed transaction twice or silently create a new payment. Explicit user approval for every real XLM payment is preserved.

## What was audited (after PR #281 / `5b6cfe16`)

| Control | Role |
| --- | --- |
| `paymentInFlight` | Same-tab in-memory mutex |
| `pendingStillOpen` + dual pending storage | Replay same signed XDR by hash until maxTime; clear when expired |
| `allowRecentDuplicate` | Explicit confirm override after duplicate warning |
| Sequence / `tx_bad_seq` | Friendly error; no auto rebuild |
| `tx_too_late` / signature timeout | Clear guidance; never auto-sign a new payment |
| Horizon confirm by transaction hash | Idempotent success path before and after submit |

## Cross-device / cross-tab protection (non-custodial)

1. **localStorage last-success (15 minutes)** — same browser/profile only.
2. **Horizon recent payment history** — public account payment feed matched on source, destination, native amount, and memo within 15 minutes. No secret keys; read-only Horizon.
3. **Cross-tab payment lock** (`havkar_stellar_payment_lock`, 3-minute stale reclaim) — blocks concurrent sign/submit from another tab in the same browser profile.
4. **Dual pending storage** — `sessionStorage` + `localStorage` so refresh / reconnect can recover the same signed hash and confirm-by-hash without building a new payment.

### Limitations (must remain documented)

- **Client-side checks cannot guarantee global exactly-once payments.** Stellar has no payment idempotency key; two devices with two deliberate approvals can still create two distinct transactions with different hashes/sequences.
- Horizon history depends on network availability; if Horizon is unreachable, local guards and hash-idempotent submit still apply, but the cross-device history check may be skipped.
- Cross-tab lock is same-origin browser storage only; it does not span devices or private browsing profiles.
- HAVKAR never stores or uses secret keys. All signatures remain in the user’s wallet (Albedo / Freighter / LOBSTR / WalletConnect).

## Explicit approval

- Review panel before sign.
- Duplicate-warning `confirm` (with EN/SV/FA i18n) before override.
- Separate Mainnet Owner confirmation dialog.
- Wallet must still approve `stellar_signXDR`.
- No auto-retry that creates or signs a new payment after timeout or reconnect.

## Tests

- `tests/havkar-stellar-duplicate-submit-guard.test.mjs` — mocks only; no Mainnet submit; no real XLM.
- Existing Testnet / owner-tx verify suites remain non-custodial.

## Android LOBSTR

Device UI for the duplicate-warning dialog on Android LOBSTR WalletConnect is **unverified** in this pass unless covered by automated browser tests.
