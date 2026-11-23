# HAVKAR — Stellar Protocol 30 (Bell) audit

Date: 23 November 2026 · No XLM sent · No private keys requested.

## Official Mainnet status (live Horizon)

| Network | Horizon | `protocol_version` | Evidence time |
| --- | --- | --- | --- |
| PUBLIC (Mainnet) | `https://horizon.stellar.org/ledgers?order=desc&limit=1` | **30** | 2026-11-23T23:12Z+ |
| TESTNET | `https://horizon-testnet.stellar.org/...` | **30** | same window |

SDF guide: JavaScript SDK **v17.3.0+** required for Protocol 30 XDR (CAP-88) and CAP-84 `W…` addresses.  
Guide: https://stellar.org/blog/developers/bell-protocol-30-upgrade-guide

## Dependency audit (before → after)

| Package | Before | After | Notes |
| --- | --- | --- | --- |
| `@stellar/stellar-sdk` | 17.2.1 | **17.4.0** | Protocol 30 / CAP-84 helpers |
| `@creit.tech/stellar-wallets-kit` | 2.6.0 | 2.6.0 | Peer `@stellar/stellar-sdk ^17.0.0` — OK |
| `@albedo-link/intent` (via kit) | 0.12.0 | 0.12.0 | Unchanged; connect path preserved |
| Horizon endpoints | public SDF | public SDF | No self-hosted Horizon/RPC |

## CAP relevance to HAVKAR

| CAP | Topic | HAVKAR action |
| --- | --- | --- |
| CAP-84 | Muxed contract `W…` addresses | Recognize + reject for classic Payment destinations with clear error; peer send remains G… only |
| CAP-87 | ML-DSA Soroban host functions | Not used — HAVKAR wallet is classic account + Horizon, not Soroban contracts |
| CAP-88 | Millisecond ledger close / header XDR | Covered by SDK ≥17.3.0; HAVKAR uses Horizon JSON for balances/history |

## Compatibility checks (read-only)

- Load Mainnet ledger with `protocol_version=30` via SDK Horizon client
- Load funded account balance + recent payments
- Build unsigned Payment XDR (no sign, no submit)
- Bundle rebuild includes `isValidMuxedContract` and `havkarFetchStellarProtocolInfo`

## Not done (by Owner order)

- No XLM send
- No transaction signature
- No private key / seed prompt
- No Soroban CAP-87 product feature
