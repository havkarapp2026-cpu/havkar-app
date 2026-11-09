# HAVKAR — Production activation status

Updated: **9 November 2026** (reconciled to live `/api/payment-activation-status`)

## Stellar Mainnet

### GREEN (completed / verified)

| Item | Evidence |
| --- | --- |
| Destination | `HAVKAR_STELLAR_MAINNET_DESTINATION=GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM` |
| Ownership | Verified `outbound_memo_payment` at `2026-11-09T13:48:08Z` |
| Testnet vs Mainnet | Fully separated in code; Testnet is never labeled Mainnet |
| Stripe / Pi | Unchanged; webhook still `REAL_PAYMENTS_PAUSED` |
| Fees in source | Buyer 2% / seller 3% / services 10% |
| Settlement guards | Unit/integration: success, memo/amount/destination match, replay refused |
| Invoice verify path | `/xlm-invoice.html` + `/api/xlm-invoice` owner Bearer verify (on `main`) |

### YELLOW (ready path; collection still paused)

| Item | Live Production |
| --- | --- |
| Flag | `HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=false` (not armed) |
| Status | `stellar.mainnet_ready=false`, `stellar_mainnet_collection=paused` |
| Owner action required | Explicitly set flag `true` on Vercel Production and redeploy **only after Owner authorizes live collection** |
| Smoke settle | Only after `mainnet_ready=true`: one tiny Owner-confirmed Mainnet payment, then verify Horizon hash |

Do not claim `armed` / `paid` / `settled` until the live API says so.

## Stripe Live (from SCF/payment audit branch)

| Item | Status |
| --- | --- |
| Account eligibility | GREEN — charges/payouts enabled, requirements clear (audit docs) |
| Connect marketplace | RED — zero connected accounts; no application_fee paths |
| Collection armed | RED — paused; flags unset |
| Money-flow evidence | `store/STRIPE_MONEY_FLOW_20261108.md` |
| Live verify | `store/STRIPE_LIVE_VERIFICATION_20261108.md` |

## SCF

| Item | Status |
| --- | --- |
| Oct Interest Form | RED — rejected 16 Oct 2026 |
| Invitation | RED — none verified |
| Corrected Interest Form draft | GREEN — `docs/scf/SCF-CORRECTED-INTEREST-FORM-20261108.md` |
| #46 deadline date | 9 November 2026 (timezone unpublished) |

## Android

| Item | Status |
| --- | --- |
| Repo AAB/signing prep | GREEN docs |
| Play closed testing 12+14 | RED — Console evidence not available here |
| Production worldwide claim | RED — not claimed |

## Actually activated

None of: Stripe live collection, Pi, Trade, Stellar Mainnet customer payments, Play production, SCF invitation/submit.

Live customer collection remains intentionally paused without new Owner permission.
