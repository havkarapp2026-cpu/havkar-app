# HAVKAR — SCF #46 submission-ready package

Status: **prepared for owner paste into the official invitation form**.  
This agent has **not** submitted the application. Do not treat this file as an official SCF receipt.

## Official facts (re-verified 8 November 2026)

| Item | Verified value | Source |
| --- | --- | --- |
| Round | SCF #46 Build Award | https://communityfund.stellar.org/awards |
| Round page | Build Submission TBD → **9 November 2026** | https://communityfund.stellar.org/awards/recxrSMYwAl8vcglg |
| Deadline date | **9 November 2026** | Official awards page (date only) |
| Deadline timezone | **Not published** on the official page | Treat as ambiguous; submit **before end of 8 November 2026 UTC** to avoid timezone risk |
| Award size | Up to $150,000 in XLM | Official awards page / handbook |
| Tracks | Open, Integration, RFP | https://stellar.gitbook.io/scf-handbook/scf-awards/build-award |
| Interest form | Required first; invitation by email for full proposal | Official handbook |
| Owner interest form | Owner-reported submitted **6 October 2026** | Owner statement (not agent-verified inbox) |
| Full submission URL | Only the **invitation email link** | Agent cannot invent or open a private invite |
| Public entry | https://communityfund.stellar.org/awards | Interest / round info |

Panel review window published on the round page: 11–18 November 2026.  
Community vote window: 23 November – 3 December 2026.

## Eligibility truth for HAVKAR

GREEN / ready to claim:

- Italian registered business: **HAVKAR DI JALILNIA AMIR** (owner-stated Chamber of Commerce registration **3 November 2026**)
- Working production app: https://havkar-app.vercel.app
- Non-custodial Stellar wallet path with Horizon Mainnet evidence (1 XLM payment)
- Interest form already submitted (owner-reported)

YELLOW / owner must confirm before Submit:

- SCF invitation email for full #46 Build proposal exists in the owner inbox
- Authorized representative + at least two eligible individuals (handbook)
- Final budget amount acceptance ($54,000 recommended; owner may revise)
- Track choice: **Open** recommended (new Stellar service-order settlement). Integration only if a measured onchain metric is ready

RED / must not claim:

- Stellar Mainnet customer payments are live (`STELLAR_MAINNET_PAYMENTS_ENABLED = false`)
- Active user / revenue / partner counts (not verified in repository)
- That this document was submitted to SCF

## Copy-paste fields (English)

### Project name
HAVKAR

### One-line summary
HAVKAR is a multilingual consumer services platform that already connects an external Stellar wallet (including LOBSTR) for non-custodial XLM payments; this award funds binding those payments to real HAVKAR service orders and launching that path on Mainnet.

### Problem
People can already use HAVKAR for delivery, marketplace, jobs, events, and related services, but those orders still lack a production-ready Stellar settlement path that keeps the secret key in the user’s wallet and ties the Horizon payment to the same order record.

### Solution
Reuse the existing non-custodial wallet, XDR validation, and Horizon submit path. Fund the remaining work to (1) attach unsigned native XLM payments to real orders on Testnet, (2) ship threat model + monitoring + failure handling, and (3) enable one verified Mainnet service payment without HAVKAR custody of keys.

### Why Stellar
Stellar gives HAVKAR a low-fee, multi-currency-friendly rail for cross-border users who already hold XLM or can receive it through wallets such as LOBSTR. HAVKAR needs Stellar specifically for non-custodial order settlement that Horizon can verify, not for another custodial euro ledger.

### What already works (Testnet / Mainnet evidence)
- Network: Mainnet passphrase `Public Global Stellar Network ; September 2015`
- Horizon: https://horizon.stellar.org
- Testnet Horizon available: https://horizon-testnet.stellar.org
- Wallet kit: `@creit.tech/stellar-wallets-kit` + `@stellar/stellar-sdk`
- HAVKAR builds and validates XDR; the external wallet signs; HAVKAR submits only after checks
- Verified Mainnet payment hash: `31b7592078ec91730b417c920d8f63cf77613f49be1e5d60baf2dec7f2e9ce76`
- Horizon link: https://horizon.stellar.org/transactions/31b7592078ec91730b417c920d8f63cf77613f49be1e5d60baf2dec7f2e9ce76
- Amount: 1.0000000 XLM · Ledger 65040002 · 2026-10-20T08:43:13Z · successful=true
- Source: `GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM`
- Destination: `GAPCPQKBQ2VKSSRXUFOCGNUYEJLT3FRPYBCJCN2SJZ2TPLGEMMCUJV4L`

### What remains before Mainnet customer payments
- Order-linked unsigned payment construction for delivery/marketplace
- Server-side order ↔ Horizon hash binding
- Threat model, monitoring, replay/failure tests
- Owner Mainnet checklist; source flag remains `STELLAR_MAINNET_PAYMENTS_ENABLED = false` until that checklist passes

### Security posture (honest)
- Non-custodial: no seed phrase or secret key collection
- Signed XDR checked for source, sequence, fee, time bounds, hash, operation, destination, amount, memo, and connected-key signature before submit
- Euro ledger tables are separate from Stellar
- Not a third-party audit
- No invented traction metrics

### Roadmap and budget (owner approval required for the dollar amount)

Recommended request: **$54,000** (not the $150,000 cap).  
Assumption: $75 fully loaded engineering hour (owner may replace with real quotes).

| Payment | When | Share | USD |
| --- | --- | --- | --- |
| 0 | Award acceptance advance | 10% | 5,400 |
| 1 | Tranche 1 — Testnet order-payment MVP | 20% | 10,800 |
| 2 | Tranche 2 — threat model, monitoring, failure handling | 30% | 16,200 |
| 3 | Tranche 3 — one Mainnet service payment | 40% | 21,600 |

Duration: 16 weeks (inside handbook 6-month guidance).  
Excluded per handbook: marketing, user acquisition, token giveaways, legal fees, audit fees, reimbursement of already-built wallet work.

### Evidence links
- Production: https://havkar-app.vercel.app
- Wallet: https://havkar-app.vercel.app/wallet.html
- Repository: https://github.com/havkarapp2026-cpu/havkar-app
- Draft detail: `docs/scf/SCF46-APPLICATION-DRAFT.md`
- Readiness: `docs/scf/SCF46-READINESS.md`

### Business
- Legal name: HAVKAR DI JALILNIA AMIR
- Registration: Italian Chamber of Commerce, 3 November 2026 (owner-stated)
- Site: https://havkar.online / https://havkar-app.vercel.app

## Owner submit checklist (do in order)

1. Confirm the SCF #46 invitation email is present.
2. Open only the official invitation submission URL from that email.
3. Paste the fields above. Do not claim Mainnet customer payments are enabled.
4. Confirm or edit the $54,000 budget.
5. **Stop before the final Submit button** unless you explicitly decide to submit.
6. After submit, keep the confirmation email/PDF as the only proof of submission.
