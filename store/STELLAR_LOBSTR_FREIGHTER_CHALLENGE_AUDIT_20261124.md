# LOBSTR / Freighter security challenge audit — 2026-11-24

## Scope
Prove wallet control for LOBSTR and Freighter **without** building or submitting any XLM payment. No private keys requested.

## Permissions (from Stellar Wallets Kit modules)
### LOBSTR
- `isConnected` / `getPublicKey` for connect
- `signTransaction(xdr)` for payments (ignores dApp `networkPassphrase` / address)
- `signMessage(message)` for no-transfer challenge — **supported**
- `signAuthEntry` / `getNetwork` — **not supported**

### Freighter
- Desktop extension: `requestAccess`, `getAddress`, `signTransaction`, `signMessage`, `signAuthEntry`, `getNetwork`
- Honors `networkPassphrase`
- Android Freighter Mobile: extension module returns unavailable when `window.stellar.platform === "mobile"` → use **WalletConnect** entry in the kit modal

### Albedo
- Payment signing supported (Owner Mainnet Albedo→LOBSTR already verified)
- Kit `signMessage` not supported → challenge button explains to use LOBSTR/Freighter

## HAVKAR addition
- UI: **Verify signature (no XLM)**
- API: `havkarVerifyStellarWalletChallenge()` → `StellarWalletsKit.signMessage(...)`
- Result flags: `transferred:false`, `submitted:false`

## Automated coverage
`tests/havkar-stellar-wallet-challenge.test.mjs` (localhost test signer only)

## Owner manual steps remaining (device-side)
1. LOBSTR already connected: open Wallet → **Verify signature (no XLM)** → approve message in LOBSTR (not a payment).
2. Android Freighter: Connect → **WalletConnect** → Freighter Mobile → then **Verify signature (no XLM)**.
