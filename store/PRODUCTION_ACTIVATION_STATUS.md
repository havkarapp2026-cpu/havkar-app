# HAVKAR — Production activation status

Updated: **9 November 2026** (live Production reconciled)

## Stellar Mainnet

### GREEN (completed / verified)

| Item | Evidence |
| --- | --- |
| Destination | `HAVKAR_STELLAR_MAINNET_DESTINATION=GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM` |
| Ownership | Verified `outbound_memo_payment` at `2026-11-09T13:48:08Z` |
| Flag | `HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=true` (Owner-authorized 9 Nov 2026) |
| Smoke settle | Intent `39f59f21-ddd3-45ee-927a-87e6efc56641` → `settled` |
| Horizon tx | `92781d576093b96e2a92295bc731f555dede8838b0624f61ed20522fdf4c8811` |
| Match proof | memo `7b1aebdb718a12b807ce`, native `7.7528218` XLM, destination match, payer `GAPCPQKBQ2VKSSRXUFOCGNUYEJLT3FRPYBCJCN2SJZ2TPLGEMMCUJV4L` |
| Testnet vs Mainnet | Fully separated; Testnet never labeled Mainnet |
| Fees in source | Buyer 2% / seller 3% / services 10% |
| Settlement guards | memo/amount/destination/replay/expiry enforced in `lib/stellar-checkout.cjs` |
| Invoice verify path | `/xlm-invoice.html` + `/api/xlm-invoice` |

### YELLOW

| Item | Status |
| --- | --- |
| Stripe / Pi live collection | Still paused (`HAVKAR_REAL_PAYMENTS_ENABLED` not true; secret mode unknown in status API) |
| Partita IVA / REA / ATECO | Not published — verified Visura not present in repo/env |
| Mailbox SMTP send/receive | Official addresses published; inbox AUTH not proven in this environment |

## Stripe Live

| Item | Status |
| --- | --- |
| Collection armed | RED — paused |
| Evidence | `store/STRIPE_LIVE_VERIFICATION_20261108.md` |

## Actually activated

- Stellar Mainnet **one-time** XLM quotes/settlement path (Owner-armed after smoke).
- Not activated: Stripe live, Pi, Trade, recurring XLM, Play/App Store public release, invented chamber numbers.
