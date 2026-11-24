# HAVKAR — Android LOBSTR WalletConnect fix (2026-11-24)

## Real problem (Owner report)

1. LOBSTR is installed on the Android phone.
2. Connect modal shows **Install** next to LOBSTR.
3. WalletConnect search for LOBSTR returns **No Wallet found**.
4. Goal: connect + message signature challenge only (no XLM transfer).

## Root cause

Two separate mismatches:

### A. False Install badge

`LobstrModule` / `FreighterModule` from `@creit.tech/stellar-wallets-kit` detect only the **browser extension**. The Android LOBSTR app is not an extension, so `isAvailable()` is false → UI shows **Install** (opens lobstr.co), even when the app is installed.

### B. WalletConnect search empty

WalletConnect AppKit was initialized with default Ethereum `mainnet` (`eip155:1`). Explorer filter:

| chains query | LOBSTR results |
|---|---|
| `eip155:1` | **0** (No Wallet found) |
| `stellar:pubnet` | **1** (`LOBSTR Wallet`, id `76a3d548…`) |

## Fix (no private keys, no XLM transfer)

1. Hide extension-only modules on mobile browsers (`EXTENSION_ONLY_WALLET_IDS`).
2. Override WalletConnect `appKitOptions.networks` with `stellar:pubnet` / `stellar:testnet`.
3. Feature / include LOBSTR + Freighter + Scopuly WalletConnect explorer IDs.
4. Mobile connect modal: `showInstallLabel:false`, `hideUnsupportedWallets:true`.
5. Dedicated button: **Connect LOBSTR via WalletConnect** → `havkarConnectStellarWalletConnect()`.
6. Challenge path accepts `wallet_connect` module id (signMessage only).

## Verification

- Unit: `tests/havkar-stellar-lobstr-android-wc.test.mjs` (explorer live check + challenge via WC module).
- Regression: challenge + tx-flow + protocol30 tests.
- Owner device after deploy: open Wallet → Connect LOBSTR via WalletConnect → Verify signature (no XLM). Keep LOBSTR WalletConnect screen open.

## Status

- Code: fixed in branch `cursor/stellar-lobstr-android-wc-fix-d4b2`
- Interactive Android LOBSTR approve: Owner device only (🟡 until confirmed)
