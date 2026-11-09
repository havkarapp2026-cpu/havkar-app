# HAVKAR — Production activation status (Stellar Mainnet)

Updated: **9 November 2026**

## GREEN (completed / verified)

| Item | Evidence |
| --- | --- |
| Mainnet code on `main` (PR #138) | Merged + deployed |
| Schema allows `network=mainnet` | Prod constraint verified |
| Unique `tx_hash` / refund hash | Partial unique indexes present |
| RLS | Users read own intents only |
| Migration `20261109033000` | Reconciled in `schema_migrations` |
| Fees | Buyer 2% / seller 3% / services 10% |
| Horizon destination live-check | Quotes refuse missing accounts |
| Stripe/Pi | Unchanged / paused |
| `HAVKAR_STELLAR_MAINNET_DESTINATION` | Set on Vercel Production to Owner-designated LOBSTR public key `GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM` |
| Horizon Public account | Exists; native balance funded (~24 XLM); sole ed25519 signer |

## YELLOW (genuine Owner blockers before arming)

| Blocker | Exact action |
| --- | --- |
| Cryptographic control of receiving wallet not yet proven in-app | From LOBSTR, prove control of `GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM` (sign the HAVKAR Mainnet ownership challenge, or confirm after a controlled tiny outbound Mainnet payment from that account with a memo we specify) |
| `HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED` remains `false` by design | After ownership proof + readiness, Owner authorizes setting exact `true` and Production redeploy |
| Real-money smoke settlement | After `mainnet_ready=true`, one tiny inbound payment + verified settlement |

## RED

None for destination configuration. Customer Mainnet collection remains **paused**.

## Success criteria (not yet met)

```text
GET /api/payment-activation-status
stellar.mainnet_ready = true
stellar_mainnet_collection = armed
```
