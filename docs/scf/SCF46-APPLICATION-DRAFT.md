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

Implemented in this repository, and not deployed: an optional Stellar Testnet checkout for an existing paid event ticket. The buyer can still use the existing card checkout. Delivery, market, and jobs do not create or submit Stellar payments.

Not done: the database migration has not been applied, the merchant account is not configured in production, and this checkout cannot submit to Mainnet.

## Problem and solution

Implemented: a person can connect an external Stellar wallet, review an XLM payment, sign it in that wallet, and have HAVKAR submit the signed transaction only after it matches the payment that was reviewed.

Implemented in this repository for event tickets on Testnet: the server calculates the XLM amount from the event's euro price and a public EUR quote, builds an unsigned native payment to the configured merchant account, and marks the ticket valid only after a fresh Horizon read. The wallet signs. HAVKAR still does not hold a secret key.

Planned: the same confirmation for delivery or marketplace orders, and any Mainnet service checkout. Mainnet service checkout needs a separate owner approval.

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

This confirms a LOBSTR-held account signed a Mainnet payment and HAVKAR recorded the successful Horizon result. It does not prove a count of users. It is not an event-ticket purchase.

Verified Testnet service payment from the new ticket checkout tests, read from `https://horizon-testnet.stellar.org` on 2026-10-20:

- Hash: `a72066cae5ac3dc3f58a20dcc5b25aa2d7abd0dc241ac8052f260cb83602c958`
- Successful: yes
- Ledger: 5293395
- Created: 2026-10-20T10:02:42Z
- Source: `GCZTBCLWODND3KFLIWVW6MAE2FEHJKTUUP364BHNGQQ5T35X7TFPWMPW`
- Destination: `GDFQRPV5QGXEY2WAGA3LXMCNNCI2RNIEY4HAHDY7LAXLTABLR32DLX3N`
- Amount: 0.1000000 native XLM
- Memo: `hk1c690f5c2741a12e6c12a7fa`
- Fee charged: 100 stroops
- Operations: 1 payment

The test used a new Friendbot-funded account. It did not spend the Mainnet account above. The payment is not linked to a production ticket because the new table has not been applied to production.

Planned: no Soroban contracts are in the repository. No open-source contract plan is required until a contract is proposed. If a later design adds contracts, the submission must include an open-source plan before it is sent.

## Ecosystem impact

Implemented: HAVKAR is a working non-custodial path from a consumer service app to LOBSTR and Horizon, with the checks above.

Implemented in code, still not in production: a paid event ticket can carry the same reference in the Stellar memo and, after the migration is applied, in the ticket row. The Testnet transaction above shows the memo a reviewer can match.

Planned: delivery and marketplace orders are not on this path yet. Production ticket rows are not created by the Testnet test.

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
- A Stellar payment table for event tickets is prepared in `supabase/migrations/20261020095735_stellar_ticket_payments.sql`. It has not been applied to production. Authenticated users would be able to read only their own rows. The migration grants them no insert, update, or delete
- Duplicate protection for a wallet-page payment remains in browser session storage. Ticket checkout adds a unique transaction hash in the prepared table so the same hash cannot confirm a second ticket
- Production database policies were not re-queried for this draft

Planned in tranche 2: a written threat model and a monitoring plan, which the submission criteria require for tranche 2.

## Development roadmap

The roadmap below is future work. It does not describe the wallet that already shipped.

Duration assumption: 16 weeks, inside the handbook limit of 6 months.

### Tranche 1 — order payment MVP

Repository work already present: event-ticket Testnet checkout in `lib/stellar-ticket-payment.mjs`, `events.html`, and the four `/api/stellar-ticket-*` routes. `node tests/stellar-ticket-payment.test.mjs` submitted the Testnet payment listed above and rejected a bad signature, a wrong destination, a wrong amount, a Mainnet envelope, an expired time bound, an insufficient balance, a duplicate hash, and a network failure. The ticket stayed unpaid in those failure cases.

Still required before this tranche can be called delivered: owner approval to apply the migration, a Testnet merchant public key in the server environment, and a human signature from the events page. No Mainnet service payment is part of this tranche.

The original delivery and marketplace wording is now planned work, not the first integration. Event tickets were selected because they already had a server-side price, a pending order, and a server-only confirmation path.

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
