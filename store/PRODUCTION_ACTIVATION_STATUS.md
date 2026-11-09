# HAVKAR — Production activation status (Stellar Mainnet)

Updated: **9 November 2026**

## GREEN (completed / verified)

| Item | Evidence |
| --- | --- |
| PR #138 / #139 | Merged into `main` |
| Destination | `HAVKAR_STELLAR_MAINNET_DESTINATION=GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM` |
| Ownership | Verified `outbound_memo_payment` at `2026-11-09T13:48:08Z`, tx `faaf2b7e9599c58a9cd7194cca2745c786b87706fa2c800b117a0650903aded3` |
| Flag | `HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=true` |
| Production status | `stellar.mainnet_ready=true`, `stellar_mainnet_collection=armed` |
| Stripe / Pi | Unchanged; webhook still `REAL_PAYMENTS_PAUSED` |
| Fees in source | Buyer 2% / seller 3% / services 10% |
| Settlement guards | Unit/integration: success, memo/amount/destination match, replay refused |

## YELLOW (on-chain smoke paid; HAVKAR intent still unpaid)

Smoke marketplace intent:

- Intent: `39f59f21-ddd3-45ee-927a-87e6efc56641`
- Buyer amount: **1.02 EUR** → **7.7528218 XLM** memo `7b1aebdb718a12b807ce`
- Destination: `GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM`
- Candidate Horizon tx (do not claim settled until Production says so): `92781d576093b96e2a92295bc731f555dede8838b0624f61ed20522fdf4c8811`
- Duplicate on-chain tx (leave untouched): `a5e7928c…` (not used for settle)

Production invoice still reports `status=unpaid` until the **intent owner** signs in and clicks **Verify Payment** on `/xlm-invoice.html` (Bearer session → existing verify endpoint). Do not claim `paid`/`settled` until that response.

## RED

None for Mainnet one-time XLM arming.
