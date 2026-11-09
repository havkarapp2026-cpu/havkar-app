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

## YELLOW (Owner confirmation before smoke transfer)

Proposed minimal Mainnet marketplace smoke payment (not sent yet):

- Listing price: **1.00 EUR**
- Buyer pays: **1.02 EUR** (2% fee)
- Seller fee reference: **0.03 EUR** (3%)
- Approximate XLM at current rate: see live quote at confirmation time
- Destination: `GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM`
- Network: Stellar Public / Mainnet

No customer smoke settlement is claimed until Owner confirms amount + destination and a matching Horizon hash settles an unpaid intent.

## RED

None for Mainnet one-time XLM arming.
