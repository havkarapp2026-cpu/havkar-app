# HAVKAR — Production activation status

Updated: **10 November 2026** (Revolut …8455 default payout verified; card collection still paused; Partita unpublished)

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

### Legal identity (public)

| Item | Status |
| --- | --- |
| Legal name | HAVKAR DI JALILNIA AMIR |
| Registration number | KR234170 (Revolut Business doc 9 Nov 2026) |
| Registered address | Francesco Antonio Lucifero 40, 88900 Crotone, Italy |
| REA | KR-234170 (from Revolut Business registration KR234170) |
| Partita IVA | Unpublished — no Visura on file |
| Bank / IBAN / BIC | Never in frontend or git — Stripe Dashboard only |

### YELLOW

| Item | Status |
| --- | --- |
| Stripe / Pi live collection | Still paused (`HAVKAR_REAL_PAYMENTS_ENABLED` not true; secret mode unknown in status API) |
| Revolut as Stripe payout bank | Owner must attach in Stripe Dashboard |
| Partita IVA / REA / ATECO | Not published — verified Visura not present in repo/env |
| Mailbox SMTP send/receive | MX/SPF/DMARC present; inbox AUTH not proven in this environment |
| Staff Workspace | `staff.html` + RPCs applied; MFA/elevation remain Owner-ops |

## Stripe Live

| Item | Status |
| --- | --- |
| Collection armed | RED — paused |
| Evidence | `store/STRIPE_ACTIVATION_BLOCKERS_20261109.md` |

## Actually activated

- Stellar Mainnet **one-time** XLM quotes/settlement path (Owner-armed after smoke).
- Public legal registration number + address (no bank secrets).
- Staff Workspace section 16 (non-public home tile) + Owner finance ledger RPC.
- AI route redirects `/ai` and `/ai.html` → `havkar-ai.html`.
- Not activated: Stripe live, Pi, Trade, recurring XLM, Taxi/Transfer booking, Play/App Store public release, invented Partita IVA.
