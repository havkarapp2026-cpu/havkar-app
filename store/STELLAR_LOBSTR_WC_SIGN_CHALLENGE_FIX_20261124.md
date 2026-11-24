# LOBSTR WalletConnect signature challenge fix — 2026-11-24

## Owner report
Connect via WalletConnect on Android succeeds (address, balance, history).  
`Verify signature (no XLM)` fails with:

`Saknad eller ogiltig request()-metod: stellar_signMessage`

(Swedish: missing/invalid `request()` method `stellar_signMessage`.)

## Root cause
1. HAVKAR called `StellarWalletsKit.signMessage()` → WalletConnect JSON-RPC `stellar_signMessage`.
2. Kit WC session **requires** only `stellar_signXDR`; `stellar_signMessage` is **optional**.
3. LOBSTR Android implements `stellar_signXDR` (hence payments/connect work) but **rejects** `stellar_signMessage`.
4. Official Stellar Wallets Kit docs: message / auth-entry signing is not generally available through WalletConnect.
5. Freighter Mobile *may* negotiate `stellar_signMessage`; LOBSTR mobile typically does not.
6. LOBSTR **browser extension** still supports SEP-43 `signMessage` (not the Android WC path).

## Fix (real methods only)
| Path | Method used |
|---|---|
| LOBSTR / Freighter **extension** | `signMessage` (SEP-43) |
| WalletConnect **with** `stellar_signMessage` negotiated | `signMessage` |
| WalletConnect **without** it (LOBSTR Android) | `stellar_signXDR` on a **manageData-only** challenge XDR |

Challenge XDR rules:
- Exactly one `manageData(havkar_chal)` op
- Memo `HAVKAR no-XLM challenge`
- No payment / createAccount / merge ops
- Signature verified locally against connected public key
- **Never** submitted to Horizon

If the wallet still returns the Swedish/English `stellar_signMessage` error, HAVKAR auto-falls back once to the XDR challenge.

## Non-goals preserved
- No XLM transfer
- No private key access
- Connect / balance / history path unchanged

## Tests
- `tests/havkar-stellar-lobstr-wc-sign-challenge.test.mjs`
- Updated `tests/havkar-stellar-lobstr-android-wc.test.mjs`
- Existing challenge / tx-flow / protocol30 regressions
