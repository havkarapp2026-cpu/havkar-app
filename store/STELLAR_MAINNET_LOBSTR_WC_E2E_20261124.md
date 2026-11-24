# Stellar Mainnet E2E — LOBSTR WalletConnect → Albedo (2026-11-24)

## Independent Horizon verification (read-only)

Agent fetched live Mainnet Horizon. **No new transaction was created, signed, or submitted.**

| Field | Value |
|-------|--------|
| Hash | `a78337d9eefb5dc8c6ac7743efb9fd1a171b40338c14ea7473debc4c797acd4b` |
| Successful | `true` |
| Ledger | `65653588` |
| Created (UTC) | `2026-11-24T20:59:54Z` |
| Network | Stellar Mainnet (`horizon.stellar.org`) |
| Source (LOBSTR) | `GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM` |
| Destination (Albedo) | `GAPCPQKBQ2VKSSRXUFOCGNUYEJLT3FRPYBCJCN2SJZ2TPLGEMMCUJV4L` |
| Amount | `0.0100000` XLM (native `payment`) |
| Fee charged | `100` stroops = `0.00001` XLM |
| Memo | none |
| Ops | 1 |
| Explorer | https://stellar.expert/explorer/public/tx/a78337d9eefb5dc8c6ac7743efb9fd1a171b40338c14ea7473debc4c797acd4b |

Owner-reported evidence matches Horizon: HAVKAR receipt, LOBSTR balance decrease, Albedo history credit, WalletConnect signing.

## Prior reverse Mainnet check
Earlier Owner send Albedo → LOBSTR (`f36e9d9e…`) used the **same two public accounts** in reverse. Together they confirm both Albedo and LOBSTR can send/receive on Mainnet through HAVKAR’s non-custodial path.

## Security notes verified in code
- No `Keypair.fromSecret` in payment path
- Localhost-only test sign hooks ignored on `havkar.online`
- Submit only after wallet returns signed XDR + `assertSignedPayment`
- Pending sessionStorage prevents replacing an in-flight signed payment with a second distinct payment until timebounds expire
- `paymentInFlight` blocks concurrent sign/submit
- Wallet signature wait ≈ 150s; unsigned XDR timebounds ≈ 180s
- After this patch: `tx_too_late` / signature-timeout friendly messages; 15-minute identical-payment guard in localStorage

## Status
| Item | Status |
|------|--------|
| LOBSTR WC connect | ✅ Confirmed by Owner |
| Challenge `stellar_signXDR` (no transfer) | ✅ Prior |
| Mainnet peer send 0.01 via LOBSTR WC | ✅ This hash |
| Private keys in HAVKAR | ✅ Never |
| Agent-initiated Mainnet send | 🚫 Forbidden without new Owner auth |
