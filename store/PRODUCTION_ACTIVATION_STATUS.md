# HAVKAR — Production activation status (Stellar Mainnet)

Updated: **9 November 2026** (reconciled to live `/api/payment-activation-status`)

## GREEN (completed / verified)

| Item | Evidence |
| --- | --- |
| Destination | `HAVKAR_STELLAR_MAINNET_DESTINATION=GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM` |
| Ownership | Verified `outbound_memo_payment` at `2026-11-09T13:48:08Z` |
| Testnet vs Mainnet | Fully separated in code; Testnet is never labeled Mainnet |
| Stripe / Pi | Unchanged; webhook still `REAL_PAYMENTS_PAUSED` |
| Fees in source | Buyer 2% / seller 3% / services 10% |
| Settlement guards | Unit/integration: success, memo/amount/destination match, replay refused |
| Invoice verify path | `/xlm-invoice.html` + `/api/xlm-invoice` owner Bearer verify (merged to `main`) |

## YELLOW (ready path; collection still paused)

| Item | Live Production |
| --- | --- |
| Flag | `HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=false` (not armed) |
| Status | `stellar.mainnet_ready=false`, `stellar_mainnet_collection=paused` |
| Owner action required | Explicitly set flag `true` on Vercel Production and redeploy **only after Owner authorizes live collection** |
| Smoke settle | Only after `mainnet_ready=true`: one tiny Owner-confirmed Mainnet payment, then verify Horizon hash |

Do not claim `armed` / `paid` / `settled` until the live API says so.

## RED

None for preparing the Mainnet path. Live customer collection remains intentionally paused without new Owner permission.
