# HAVKAR — Production activation status (Stellar Mainnet)

Updated: **9 November 2026**

## GREEN (completed / verified)

| Item | Evidence |
| --- | --- |
| Mainnet destination configured | `HAVKAR_STELLAR_MAINNET_DESTINATION=GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM` |
| Horizon Public account | Exists; funded; sole signer |
| Schema / migration / fees / pause gates | Verified earlier; Stripe/Pi unchanged |
| Mainnet ownership proof API | `/api/stellar-mainnet-ownership` + `/mainnet-wallet-ownership.html` (LOBSTR `signMessage`) |
| Ownership proofs table | `stellar_mainnet_ownership_proofs` on Production |

## YELLOW (genuine Owner blockers before arming)

| Blocker | Exact action |
| --- | --- |
| Cryptographic ownership not yet proven | Open `https://havkar-app.vercel.app/mainnet-wallet-ownership.html`, connect LOBSTR with `GBORWHZD…`, sign the challenge (no XLM). |
| Mainnet payments flag still `false` | After ownership verifies in that page, agent/Owner sets `HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=true` and redeploys |
| Smoke settlement | After `mainnet_ready=true`, one tiny inbound payment |

### Fallback only if LOBSTR cannot signMessage

1. Open the ownership page and request a challenge (shows exact memo).
2. From LOBSTR, send a tiny native XLM payment **from** `GBORWHZD…` with that exact text memo.
3. Paste the successful Horizon tx hash into the page and verify.

## RED

None for implementation. Collection remains paused until ownership + flag.
