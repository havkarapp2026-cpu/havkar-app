# HAVKAR Stellar wallet transaction-flow audit — 2026-11-24

## Baseline (not repeated)
- PR #274 Protocol 30 / SDK 17.4.0 already merged (`c503806a`) and on production.
- Horizon Mainnet `current_protocol_version: 30`.

## Preferred wallets (kit `defaultModules` + HAVKAR ordering)
| Wallet | Kind | Connect | Sign | HAVKAR notes |
|--------|------|---------|------|--------------|
| Albedo | Web window | Always available | XDR + network | Popup blockers can interrupt |
| Freighter | Browser extension | `isConnected` required | Honors `networkPassphrase` | Mobile Freighter → WalletConnect path |
| LOBSTR | Browser extension | Extension session required | Ignores address + networkPassphrase | User must set Testnet/Mainnet inside LOBSTR; HAVKAR still verifies signed XDR |

## Transaction flow coverage (Testnet, Friendbot-funded ephemeral keys)
Covered by `tests/stellar-wallet.test.mjs` (real Horizon Testnet submit):
1. Build / prepare payment
2. Review fields (amount, destination, memo, fee, network)
3. Sign via localhost-only `HAVKAR_STELLAR_TEST_SIGN` (not production host)
4. Reject wrong/mutated signature
5. Submit → Horizon success + operations
6. Receipt hash returned
7. Duplicate / in-flight / unresolved pending blocked
8. Error paths: bad address, underfunded, createAccount minimum, host gate

## UI additions in this branch
- Preferred-wallet chips + capability notes
- Full destination/source in review panel
- Cancel review
- Payment receipt panel + stellar.expert link
- Mainnet confirm() before requesting a signature
- `stellarT()` + expanded `havkar-ui-i18n21` wallet strings

## Mainnet
- Network default remains PUBLIC / Mainnet.
- No real XLM was sent in this audit.
- Interactive Mainnet sign+submit requires Owner wallet approval and Owner authorization.
