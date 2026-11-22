# Stellar XLM Mainnet completion — evidence report (10 November 2026)

Branch: `cursor/stellar-xlm-mainnet-complete-d4b2`  
No Production deploy, Merge to `main`, real Mainnet customer charge, Stripe/Pi enablement, or store publish was performed.

## Verdict (Android / iOS / Web)

| Question | Answer |
| --- | --- |
| Is XLM payment code complete for allowed one-time flows? | **Mostly YES** on this branch (marketplace, services, events) |
| Is customer Mainnet live collection ON in Production right now? | **NO for this branch’s gate** — Production still runs previous code (`mainnet_collection=armed` without `LIVE_COLLECTION`). After this branch deploys, customer Mainnet quotes stay **OFF** until Owner sets `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION=true`. |
| Ready to activate real Mainnet collection for users? | **BLOCKED** until Owner: merge/deploy this branch, counsel/geo review, then set live-collection flag + redeploy + smoke settle |

WebView Android/iOS shells load the same web checkout; native Play Billing / StoreKit remain unused (correct for physical goods/services/events).

## PASS / FAIL / BLOCKED matrix

| Item | Result | Evidence |
| --- | --- | --- |
| Testnet vs Mainnet Horizon separation | **PASS** | `lib/stellar-checkout.cjs`, wallet network guards, settlement tests |
| Server amount/memo/destination/network/expiry/replay checks | **PASS** | `verifyStellarSettlement` + `tests/stellar-settlement.test.mjs` (includes live Testnet friendbot settle) |
| No private keys / recovery phrases to server | **PASS** | Wallet signs client-side; server only public destination + Horizon verify |
| Fees unchanged (buyer 2% / seller 3% / services 10%) | **PASS** | checkout + activation status commissions |
| Refuse AI/Jobs/subscription/trade XLM | **PASS** | `ALLOWED_XLM_FLOWS` + `tests/xlm-flow-guards.test.mjs` |
| Marketplace XLM UI bug (`quoted` undefined) | **PASS** (fixed) | `ad-details.html` now uses `settled.result` |
| Marketplace self-purchase blocked | **PASS** | server `SELF_PURCHASE_FORBIDDEN` + UI hide |
| Marketplace fulfillment ends listing after settle | **PASS** (code) | `fulfillSettledXlmIntent` → `marketplace_listing_ended` |
| Services one-time XLM + network-correct message | **PASS** (code) | `services.html` |
| Events ticket fulfillment after settle | **PASS** (existing + tests) | `fulfillSettledXlmIntent` events path |
| Pending / failed settlement messaging | **PASS** | `settlement=pending|failed` without marking paid |
| Refund path (Owner-signed return tx + verify) | **PASS** (code) | `action=refund` Horizon check |
| Customer Mainnet live gate OFF until Owner final approval | **PASS** (branch) | `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION` |
| Production deploy of this branch | **BLOCKED** | Owner only |
| Real Mainnet customer smoke after live flag | **NOT TESTED** / **BLOCKED** | Forbidden without Owner final approval |
| Geo / crypto licensing for all Play countries | **BLOCKED** | Counsel/Owner |
| Authenticated end-to-end wallet pay on device | **NOT TESTED** | No reviewer password / no wallet session in agent |
| Stripe / Pi live | **PASS** (remain paused) | webhook `REAL_PAYMENTS_PAUSED` |

## Code changes (this branch)

1. `lib/stellar-mainnet.cjs` — `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION` gate
2. `lib/stellar-checkout.cjs` — allowlist flows; live-collection check; pending/failed settlement
3. `api/create-event-checkout.js` — subject validation, marketplace/services fulfillment, status fields
4. `havkar-xlm-checkout.js` — prefer Mainnet only when `mainnet_customer_live`; richer quote text
5. `ad-details.html` — fix pay bug; dynamic network labels; block self-pay
6. `services.html` / `events.html` — network-accurate messaging / wallet copy
7. Docs + tests (`store/STELLAR_MAINNET_OPS.md`, `tests/xlm-flow-guards.test.mjs`, …)

## Automated tests run

All **PASS** (17): stellar-checkout, stellar-mainnet, stellar-settlement (incl. real Testnet tx), stellar-wallet, ownership, lobstr-sign-guard, xlm-invoice, xlm-flow-guards, real-payments-pause.

## Owner actions to activate real Mainnet collection

1. Review and merge this branch (no auto-merge by agent).
2. Deploy to Vercel Production.
3. Confirm `/api/payment-activation-status` shows `stellar_mainnet_customer_live=paused` and Testnet still works.
4. Counsel confirms crypto wallet / geo restrictions for Play/App Store countries.
5. Set `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION=true` (exact) and redeploy.
6. Owner smoke: one tiny Mainnet payment on marketplace/services/events; confirm intent `settled` + Horizon hash.
7. Do **not** enable Stripe/Pi from this workstream.
