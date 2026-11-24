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

## Mainnet — Owner-signed live verification (2026-11-24)

Recorded from Owner-reported successful send. Verified read-only against live Horizon Mainnet. **No private keys were requested, stored, or logged.** No additional Mainnet payment was created by the agent.

| Field | Value |
|-------|--------|
| Date (UTC) | 2026-11-24 (`created_at` 2026-11-24T08:37:06Z) |
| Network | Stellar Mainnet (`PUBLIC`) |
| Protocol | Ledger `65644675` → `protocol_version: 30` |
| Signer / source wallet | Albedo (Owner-signed) |
| Destination wallet | LOBSTR |
| Amount | `0.0100000` XLM (native) |
| Fee charged | `100` stroops = `0.00001` XLM |
| Horizon `successful` | `true` |
| Operation | `payment` (1 op) |
| Transaction hash | `f36e9d9e4184fa865b1eb3a3d1032564d5154c51459f6e949d85077c6c6ec66d` |
| Explorer | https://stellar.expert/explorer/public/tx/f36e9d9e4184fa865b1eb3a3d1032564d5154c51459f6e949d85077c6c6ec66d |

Horizon-confirmed public accounts (safe to record; not secrets):
- Source `G…`: `GAPCPQKBQ2VKSSRXUFOCGNUYEJLT3FRPYBCJCN2SJZ2TPLGEMMCUJV4L`
- Destination `G…`: `GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM`

### Status after this verification
- Testnet automated peer-payment path: verified earlier (PR #275).
- Mainnet interactive Owner sign + successful network settle: **verified** via the hash above.
- Agent must not create or submit any further Mainnet/Testnet payments without new Owner authorization.
