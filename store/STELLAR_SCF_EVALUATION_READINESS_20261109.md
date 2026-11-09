# HAVKAR — Stellar evaluation readiness (9 November 2026)

Evidence-based. No claim of SCF award or invitation.

## Product surfaces live on Production

- Public web app: `https://havkar-app.vercel.app/`
- Events / operational tickets: create, capacity holds, free/paid issuance, unique code + QR, organizer check-in, cancel, Owner listing
- Buy & Sell marketplace with Testnet and Mainnet XLM checkout path (Mainnet Owner-armed after smoke)
- Owner Control dashboard (server RPC role gates)
- Official contacts: `info@havkar.online`, `support@havkar.online`, `soran@havkar.online` (SORAN owner-confidential)

## Stellar Mainnet payment path

| Gate | Status |
| --- | --- |
| Horizon Public destination funded | PASS |
| Owner wallet ownership proof | PASS |
| Env flag exact `true` | PASS (armed after Owner authorization) |
| Smoke intent settled with matching Horizon tx | PASS — see `store/PRODUCTION_ACTIVATION_STATUS.md` |
| Replay / memo / amount / destination / expiry checks | PASS (unit + source) |
| Testnet never presented as Mainnet | PASS |

## Not claimed

- Stripe live customer charging
- Taxi / transfer booking inside HAVKAR (contract-gated; UI states unavailable)
- Partita IVA / REA numbers (await Visura)
- App Store / Play Store public worldwide release completion
- Any SCF funding approval

## Smoke transaction (Mainnet)

- Intent: `39f59f21-ddd3-45ee-927a-87e6efc56641`
- Amount: `7.7528218` XLM (quote `1.02` EUR)
- Memo: `7b1aebdb718a12b807ce`
- Tx: `92781d576093b96e2a92295bc731f555dede8838b0624f61ed20522fdf4c8811`
- Destination: `GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM`
