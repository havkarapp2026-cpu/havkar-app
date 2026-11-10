# HAVKAR — Stellar Community Fund funding-readiness package (10 November 2026)

**Status:** Evidence package only. **Not submitted.** No award claim. Owner approval required before any external application action.

**Eligibility (verified as of 10 November 2026):** SCF #46 Interest / Build deadline recorded as **9 November 2026** in prior readiness docs — treat same-round resubmit as **unconfirmed / likely closed**. Next-round Interest Form remains the safe path unless `communityfund@stellar.org` confirms otherwise. October Interest Form was **rejected** (16 Oct 2026). **No verified Build invitation.**

## 1. Product summary

HAVKAR is a multilingual marketplace and services platform (web + Android/iOS WebView shells) with noncustodial Stellar XLM checkout for one-time marketplace, services, and event flows. Official identity: HAVKAR DI JALILNIA AMIR (KR234170). Public surfaces include Buy & Sell, Services, Jobs, Ads, Events/Tickets, Delivery, Chat, Wallet UI, and Owner/Staff controls.

## 2. Demonstrated Stellar utility (verified technical)

| Item | Status | Evidence |
| --- | --- | --- |
| Noncustodial wallet connect / sign path | Implemented | `stellar-wallet-source.js`, wallet pages |
| Testnet checkout + Horizon verify | Implemented + unit/live Testnet settlement tests | `tests/stellar-settlement.test.mjs` |
| Mainnet arming (ops) | Armed only with Owner env + funded destination | `lib/stellar-mainnet.cjs`, `store/STELLAR_MAINNET_OPS.md` |
| Mainnet customer live collection | **OFF** until Owner + legal + deploy | `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION` |
| Fee rules | marketplace 2%+3%; services 10% | `lib/stellar-checkout.cjs`, fee tests |
| Replay / memo / amount / destination / expiry guards | Covered in automated tests | `tests/xlm-*.test.mjs`, `tests/stellar-settlement.test.mjs` |
| Horizon Mainnet evidence tx (historical) | Verified in SCF readiness test | hash in `docs/scf/SCF46-READINESS.md` |

## 3. Architecture (high level)

- Client: HTML/JS WebViews → Freighter/Lobstr/Albedo-style signing (noncustodial)
- API: Vercel serverless (`api/*`) + shared `lib/stellar-checkout.cjs`
- Settlement: Horizon match on destination + native amount + memo; intent status `unpaid` → `settled` / `expired` / `refunded`
- Data: Supabase (intents, ownership proofs, RLS)
- Gates: Testnet always available when destination configured; Mainnet payments flag; separate LIVE_COLLECTION for customer charging

## 4. Milestones

### Completed (code / verified in repo)

- XLM quote + settlement verification library
- LIVE_COLLECTION hard gate (customer Mainnet OFF by default)
- Flow allowlist (marketplace / services / events only)
- Attack-vector automated tests (expired, memo, destination, amount, replay, race, refund-before-settle)
- Mobile WebView canonical host alignment work (see store release docs)
- Search hub + query forwarding; account block RLS migration (repo; Production apply Owner-gated)

### Planned / external (not claimed done)

- Owner-authorized Production deploy of this branch
- LIVE_COLLECTION=true after legal clearance
- Closed testing 14-day evidence (never fabricated)
- App Store IPA after Apple cloud signing / profile
- SCF Interest Form / Build submission (Owner only; prior Interest Form was rejected)

## 5. Security status

| Control | Status |
| --- | --- |
| No end-user seeds in server env | PASS (code review + design) |
| Server never marks paid without Horizon match | PASS (unit) |
| LIVE_COLLECTION default off | PASS (unit) |
| Stripe/Pi activation in this work | Not activated |
| Authenticated multi-device Mainnet E2E | NOT TESTED (no Owner password / live customer spend) |
| Production RLS migration for `user_blocks` | NOT APPLIED by agent |

## 6. Budget intent (draft — Owner editable)

Prior SCF materials cite ~€54,000 budget intent for build/ops. Treat as planning figure only; not an audited spend plan. Owner must finalize before any submission.

## 7. Measurable adoption targets (proposed, not current metrics)

Do **not** invent current user counts. Proposed forward targets for a future SCF cycle (Owner to edit):

1. N completed Testnet checkouts by closed testers (instrumented)
2. N Mainnet customer settlements after LIVE_COLLECTION authorization
3. Retention: returning wallet addresses with ≥2 successful settlements in 30 days

Replace N with Owner-approved numbers before submit.

## 8. Links to verified artifacts

- `docs/scf/SCF46-READINESS.md`
- `docs/scf/SCF46-APPLICATION-DRAFT.md`
- `docs/scf/SCF-CORRECTED-INTEREST-FORM-20261108.md`
- `docs/scf/SCF-ELIGIBILITY-MATRIX-20261108.md`
- `store/STELLAR_XLM_COMPLETION_20261110.md`
- `store/STELLAR_SCF_EVALUATION_READINESS_20261109.md`
- `store/PLAY_CRYPTO_COMPLIANCE_20261110.md`

## 9. Explicit non-claims

- No SCF invitation or award
- No submission performed by the agent
- No live Mainnet customer collection enabled
- No fabricated traction metrics
