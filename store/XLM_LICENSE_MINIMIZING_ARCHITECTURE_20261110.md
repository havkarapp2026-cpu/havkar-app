# HAVKAR XLM license-minimizing architecture (10 November 2026)

**Not legal advice.** Distinguishes technical facts, official published requirements, and counsel-only interpretation.

## Phase 1 — Codebase audit (confirmed technical facts)

| Question | Finding | Evidence |
| --- | --- | --- |
| Holds customer private keys / seeds? | **No** | External wallet signs via `havkarSignAndSubmitStellarPayment` in `stellar-wallet-source.js` |
| Custodial accounts for end users? | **No** | No server seed storage for buyers/sellers |
| Who broadcasts? | User wallet or client after user signature | Wallet prepare → sign → submit path |
| Who confirms payment? | Server verifies Horizon | `verifyStellarSettlement` in `lib/stellar-checkout.cjs` |
| Prior settlement destination | **HAVKAR network destination received full buyerPays** (`platform_collect`) | `buildXlmQuote` historically set `destination` from `HAVKAR_STELLAR_*_DESTINATION` |
| Fees | Marketplace 2% buyer + 3% seller; services 10% | `quoteListingFees` / `quoteServiceFees` |
| LIVE customer Mainnet | OFF unless exact env | `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION` |

**Regulatory exposure note (interpretation → counsel):** Receiving the full purchase amount to a HAVKAR-controlled destination can look closer to a payment / transfer service than pure software that only helps a user pay a merchant peer-to-peer — even when keys stay with the user.

## Phase 2–3 — Model comparison (ranked)

| Rank | Model | Legal defensibility* | XLM utility | SCF fit | Distribution | Cost/time | Security |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **C/B hybrid `direct_split`**: one user-signed tx → merchant receive + platform fee | Best among HAVKAR-operable options; still counsel for CASP classification of fee receipt / marketplace facilitation | Strong genuine settlement | Strong (real order-linked Stellar txs) | Broadest if counsel accepts non-custodial + fee transparency | Medium (implemented) | Strong verification of dual payments |
| 2 | Platform_collect (legacy) | Weaker for EU Play MiCA CASP questionnaire | Works | Medium | Restricted / geo / counsel | Low | Strong but higher regulatory surface |
| 3 | Licensed external provider (D) | Strong if partner is CASP | Depends on partner UX | Medium | Strong where partner covers | High cost / delay | Partner-dependent |
| 4 | Disable XLM in EU only (geo) | Strong for Play option A | Weakens EU XLM utility | Weaker for “global Stellar payments” narrative | Non-EU crypto; EU non-crypto | Low | N/A |

\*Legal defensibility = engineering judgment + official Play/MiCA texts; **not clearance**.

### Recommended architecture (selected)

**Primary: `direct_split` when merchant registered a Stellar receive public key.**  
**Fallback: `platform_collect` for events / merchants without keys / Owner-gated legacy (`HAVKAR_XLM_ALLOW_PLATFORM_COLLECT`, default true).**  
Fee economics unchanged: buyer still pays 102% marketplace (or 100% services); seller receives 97% (or 90%); platform fee is the residual paid **directly** in the same user-signed transaction.

## Can HAVKAR use XLM without its own CASP?

| Condition | Status |
| --- | --- |
| Technical non-custody of keys | Confirmed |
| Avoid receiving full purchase amount on HAVKAR account | Improved by `direct_split` |
| Automatic “no license needed” worldwide | **False — counsel required** |
| Google Play EU wallet/exchange + MiCA CASP table | Official Play policy still lists CASP for crypto wallet/exchange distribution in EU; Additional Options A/B/C exist — mapping is counsel + truthful declarations |
| Italy CASP list includes HAVKAR | **No** |

## EU availability of XLM

Do **not** auto-remove and do **not** auto-activate.  
Path: keep XLM code live → prefer `direct_split` → counsel chooses Play Additional Option / CASP / geo. Geo enforcement remains **OFF** until Owner approval.

## Implementation delivered in repo

- `lib/stellar-settlement-models.cjs`
- `buildXlmQuote` / `verifyStellarSettlement` dual-payment support
- Wallet multi-payment ops + `havkar-xlm-checkout.js` wiring
- `stellar_receive_accounts` migration + Wallet UI to register G… receive key
- Activation status exposes `settlement_models`

## Official references

```
https://support.google.com/googleplay/android-developer/answer/16329703?hl=en
```

```
https://eur-lex.europa.eu/eli/reg/2023/1114/oj/eng
```

```
https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/integration-track
```

```
https://communityfund.stellar.org/awards
```
