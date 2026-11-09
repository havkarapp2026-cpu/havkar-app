# HAVKAR — Production activation status (Stellar Mainnet)

Updated: **9 November 2026**

## GREEN (completed / verified)

| Item | Evidence |
| --- | --- |
| Mainnet code on `main` (PR #138) | Merged + deployed |
| Schema allows `network=mainnet` | Prod `marketplace_payment_intents_network_check` → `testnet\|mainnet` |
| Unique `tx_hash` / refund hash | `marketplace_payment_intents_tx_hash_uidx`, `marketplace_payment_intents_refund_tx_uidx` |
| RLS (users read own intents only) | Policy `Users read their unpaid marketplace intents` |
| Migration history reconciled | `supabase_migrations.schema_migrations` has `20261109033000` / `stellar_mainnet_payment_intents` |
| Fees preserved | Buyer 2% / seller 3% / services provider 10% |
| Horizon destination live-check | Mainnet quotes refuse missing Horizon Public accounts |
| Recurring XLM refused | `XLM_RECURRING_UNSUPPORTED` |
| Stripe/Pi live unchanged / paused | Prod webhook `REAL_PAYMENTS_PAUSED`; flag left alone |
| Ops docs + probe | `store/STELLAR_MAINNET_OPS.md`, `scripts/verify-stellar-mainnet-ops.mjs` |

## YELLOW (Owner action required — blocks `mainnet_ready`)

| Blocker | Exact action |
| --- | --- |
| No approved Mainnet **receiving** public key provided | Reply with the HAVKAR-approved Mainnet merchant public key `G...` (not a seed; not a guessed/testnet substitute unless you explicitly approve that same account for Mainnet collection) |
| `HAVKAR_STELLAR_MAINNET_DESTINATION` missing on Vercel Production | After the key is provided, set Production env to that `G...` value |
| `HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED` is `false` | After destination is set + Horizon-verified, set exact `true` and redeploy |
| Real-money smoke test | After `mainnet_ready=true`, Owner runs one tiny Mainnet payment and confirms settlement |

Note: `GAPCPQKBQ2VKSSRXUFOCGNUYEJLT3FRPYBCJCN2SJZ2TPLGEMMCUJV4L` is the documented **Testnet ownership / Testnet destination** key. It is **not** auto-configured as Mainnet merchant destination.

## RED

None in code/schema for this path. Activation remains **not operational** until YELLOW destination + flag are completed.

## Success criteria

```text
GET /api/payment-activation-status
stellar.mainnet_ready = true
stellar_mainnet_collection = armed
```
