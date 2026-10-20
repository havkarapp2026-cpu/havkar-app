# HAVKAR — SCF #46 Build Award draft

Status: draft for the owner. This file has not been submitted to the Stellar Community Fund.

Official sources used for the rules in this draft:

- https://communityfund.stellar.org/awards
- https://stellar.gitbook.io/scf-handbook/scf-awards/official-rules-for-submissions
- https://stellar.gitbook.io/scf-handbook/scf-awards/build-award
- https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/submission-criteria
- https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines.md

The handbook says reviewers assess only what is inside the submission. It also says award costs must support future development, not past work. This draft therefore does not ask SCF to pay for the wallet that is already on Mainnet.

## Project overview

HAVKAR is a multilingual multi-service web application. The production site is:

https://havkar-app.vercel.app

Implemented today: public pages for wallet, delivery, market, jobs, events, accommodation, translation, and an AI assistant; Supabase-backed accounts and euro ledger records; a non-custodial Stellar wallet on the wallet page.

Planned, and not built: using Stellar to settle a HAVKAR service order. Delivery, market, and jobs do not create or submit Stellar payments.

## Problem and solution

Implemented: a person can connect an external Stellar wallet, review an XLM payment, sign it in that wallet, and have HAVKAR submit the signed transaction only after it matches the payment that was reviewed.

Planned: connect that same check to a real HAVKAR order so a delivery or marketplace payment can be confirmed on Horizon without HAVKAR holding a secret key.

## Stellar integration

Implemented:

- Network passphrase for Mainnet: `Public Global Stellar Network ; September 2015`
- Horizon: `https://horizon.stellar.org`
- Testnet remains available at `https://horizon-testnet.stellar.org`
- `@stellar/stellar-sdk` builds and checks transactions
- `@creit.tech/stellar-wallets-kit` connects external wallets, including LOBSTR through WalletConnect and the LOBSTR extension API
- HAVKAR asks the wallet to sign an XDR. It does not ask the wallet to submit through `stellar_signAndSubmitXDR`
- Before submit, the signed XDR is checked for source, sequence, fee, time bounds, hash, one native operation, destination, amount, memo, and a signature from the connected public key
- An unresolved payment is not replaced by a different payment in the same browser session
- `STELLAR_MAINNET_PAYMENTS_ENABLED` is `true` in the current production source. Setting it back to `false` and redeploying stops new Mainnet payments

Verified Mainnet payment, read from Horizon on 2026-10-20 and not created by this draft:

- Hash: `31b7592078ec91730b417c920d8f63cf77613f49be1e5d60baf2dec7f2e9ce76`
- Successful: yes
- Ledger: 65040002
- Created: 2026-10-20T08:43:13Z
- Source: `GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM`
- Destination: `GAPCPQKBQ2VKSSRXUFOCGNUYEJLT3FRPYBCJCN2SJZ2TPLGEMMCUJV4L`
- Amount: 1.0000000 native XLM
- Fee charged: 100 stroops
- Operations: 1 payment

This confirms a LOBSTR-held account signed a Mainnet payment and HAVKAR recorded the successful Horizon result. It does not prove a count of users.

Planned: no Soroban contracts are in the repository. No open-source contract plan is required until a contract is proposed. If a later design adds contracts, the submission must include an open-source plan before it is sent.

## Ecosystem impact

Implemented: HAVKAR is a working non-custodial path from a consumer service app to LOBSTR and Horizon, with the checks above.

Planned impact, only if the funded work ships: a person can pay for an existing HAVKAR service in XLM while the service record and the Horizon payment refer to the same order. That is the Stellar use that is not a standalone wallet.

No user, volume, or revenue number is stated here because the repository does not contain a verifiable traction report.

## Security architecture

Implemented:

- The secret key and recovery phrase stay in the external wallet. HAVKAR does not ask for them and does not store them
- The browser holds only the public address returned by the wallet
- Mainnet submission is behind the source flag above
- Euro ledger tables are separate from Stellar. Repository migrations enable row-level security on the application tables that hold wallets, delivery, market, profiles, and related records
- A repository migration revokes anonymous execute on `create_user_wallet` and `handle_new_user`

Not claimed:

- This draft is not a third-party audit
- The Stellar public key is not bound to the Supabase user
- There is no Stellar payment table. Horizon is the payment record
- Duplicate protection for an in-flight XLM payment is in browser session storage
- Production database policies were not re-queried for this draft

Planned in tranche 2: a written threat model and a monitoring plan, which the submission criteria require for tranche 2.

## Development roadmap

The roadmap below is future work. It does not describe the wallet that already shipped.

Duration assumption: 16 weeks, inside the handbook limit of 6 months.

### Tranche 1 — order payment MVP

Deliverable: on Testnet, a delivery or marketplace order can prepare an unsigned native XLM payment, the existing wallet signs it, and the order shows the Horizon transaction hash only after the current confirmation checks pass.

Verification: an automated test using a Testnet account, plus a recorded Testnet flow. No Mainnet payment is part of this tranche.

Cost: $10,800, which is 144 engineering hours.

### Tranche 2 — threat model, monitoring, and failed-payment handling

Deliverable: a STRIDE-style threat model, a monitoring plan, and tests for rejected signatures, wrong network, missing accounts, and replay of the same transaction hash.

Verification: the documents are in the repository and the tests fail closed without submitting a second different payment.

Cost: $16,200, which is 216 engineering hours.

### Tranche 3 — one Mainnet service payment

Deliverable: one production HAVKAR service order can be paid in XLM from an external wallet. The order page shows the same hash that Horizon shows. HAVKAR still does not hold the secret key.

Verification: a Horizon payment whose memo or linked order id is visible to a reviewer, plus the unchanged validation code.

Cost: $21,600, which is 288 engineering hours.

Payment split required by the budget guidelines, applied to a $54,000 request:

| Payment | When | Share | USD |
| --- | --- | --- | --- |
| 0 | Award acceptance, advance on the work below | 10% | 5,400 |
| 1 | Tranche 1 accepted | 20% | 10,800 |
| 2 | Tranche 2 accepted | 30% | 16,200 |
| 3 | Tranche 3 accepted | 40% | 21,600 |

The number of XLM is not fixed in this draft. The handbook values the award with the CF Stellar Lumens-Dollar Settlement Price, ticker XLMUSD_RR, on the day of payment.

## Budget

Recommended request: $54,000. The $150,000 cap is not requested.

Assumption, which the owner must replace with real quotes before submission: $75 per engineering hour, fully loaded. Deliverable hours are 648. The $5,400 acceptance payment is 72 hours of the same rate and is an advance, not a fourth product.

| Work | Hours | USD at $75 |
| --- | --- | --- |
| Acceptance advance | 72 | 5,400 |
| Tranche 1 | 144 | 10,800 |
| Tranche 2 | 216 | 16,200 |
| Tranche 3 | 288 | 21,600 |
| Total | 720 | 54,000 |

Excluded because the handbook disallows them: marketing, user acquisition, token giveaways, legal fees, audit fees, and reimbursement of the wallet already built.

Integration Track only: if the owner later chooses that track, the submission must add a modest onchain metric, a measurement window, and the accounts that will be measured. This draft does not invent that metric.

## Team and eligibility

Not in the repository, and required before an application can be honest:

- One authorized representative
- At least two eligible individuals for preparation webinars, bootcamp, and a finalist demo
- Ages, residence, and sanctions status under Official Rules section 1.3
- KYC or KYB only after selection, at https://stellar.org/bd-kyc
- A statement that the team is not in another SCF submission and is not drawing overlapping SDF grant funds
- Verifiable traction or a named Stellar-experienced person who can validate the need
- The interest form on https://communityfund.stellar.org/awards

SCF #46 interest deadline published on that page: November 8, 2026. An interest form does not guarantee an invitation or funding.

## Demo and repository

- Production: https://havkar-app.vercel.app
- Wallet: https://havkar-app.vercel.app/wallet.html
- Horizon transaction: https://horizon.stellar.org/transactions/31b7592078ec91730b417c920d8f63cf77613f49be1e5d60baf2dec7f2e9ce76
- Repository: https://github.com/havkarapp2026-cpu/havkar-app

## Recommendation

NOT READY to submit. The Mainnet payment is real. The application is not yet eligible on the facts available in the repository.
