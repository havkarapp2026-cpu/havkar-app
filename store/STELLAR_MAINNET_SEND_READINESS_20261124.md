# HAVKAR Stellar Mainnet send readiness — 2026-11-24

## Scope
Prepare peer XLM send (HAVKAR → LOBSTR via WalletConnect `stellar_signXDR`) for an Owner-authorized **0.01 XLM** Mainnet experiment.  
**No real XLM was sent in this work.**

## Production baseline (after PR #278 / #279)
- LOBSTR Android WalletConnect connect: working (address, balance, history)
- No-transfer challenge: `stellar_signXDR` manageData (never submitted)
- Client flag: `STELLAR_MAINNET_PAYMENTS_ENABLED = true` → Peer send chip = **user-signed only** (not blocked)
- Signing: `StellarWalletsKit.signTransaction` → wallet only; no `Keypair.fromSecret` in payment path
- Submit: Horizon only after wallet returns signed XDR + `assertSignedPayment`

## End-to-end path
1. Connect LOBSTR via WalletConnect (module `wallet_connect`)
2. Network = Mainnet (`PUBLIC` / `horizon.stellar.org`)
3. **Review payment** → `havkarPrepareStellarPayment` (unsigned XDR only)
4. UI shows: network, from, destination, amount, fee, spendable, balance, reserve, type, memo, sequence, unsigned hash
5. **Confirm** → Mainnet `window.confirm` with full details → wallet `stellar_signXDR` → local assert → Horizon submit
6. Cancel / deny at confirm or wallet = nothing submitted

## Validations already enforced
| Check | Where |
|---|---|
| Destination must be G… (not W…/M…/C…) | `requireClassicPaymentDestination` |
| Destination ≠ source | prepare |
| Amount > 0, ≤ 7 decimals | `parseXlm` |
| Memo ≤ 28 bytes | prepare |
| Spendable ≥ amount (+ fee vs reserve) | prepare |
| createAccount min 2× base reserve if dest missing | prepare |
| Signed XDR matches prepared fields | `assertSignedPayment` |
| Horizon host/passphrase allow-list | `assertStellarSubmissionAllowed` |
| Explicit Mainnet confirm | `confirmHAVKARStellarPayment` |

## This readiness patch
- Review panel: spendable, balance, reserve, fee XLM, sequence, unsigned hash, signing disclaimer
- WalletConnect capability note (set Mainnet inside LOBSTR)
- Stronger Mainnet confirm dialog (from/to/amount/memo/fee)
- Refuse confirm if network changed after review
- Automated dry-run: live Horizon **prepare only** for 0.01 XLM (POST /transactions guarded)

## Ready for Owner 0.01 XLM experiment?
**Yes — after this PR deploys**, with Owner present on device:

1. Connect LOBSTR WC on Mainnet (inside LOBSTR app network = Mainnet)
2. Destination = funded G… (LOBSTR receive account)
3. Amount = `0.01`, optional short memo
4. Review → verify spendable ≥ 0.01 + fee
5. Confirm dialog → approve in LOBSTR → wait for Horizon receipt

Still required from Owner (human): explicit intent to move real XLM; HAVKAR agents must not click Confirm for them.
