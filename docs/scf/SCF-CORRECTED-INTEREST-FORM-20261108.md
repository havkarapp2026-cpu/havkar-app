# Corrected SCF Build Interest Form — HAVKAR

Status: **DRAFT for owner paste**. Not submitted by this agent.  
Previous Interest Form (~6 Oct 2026) was **rejected** (SCF email 16 Oct 2026). This is a **resubmission draft** with significant updates.

Official Interest Form entry:

```
https://communityfund.stellar.org/awards
```

Before paste: email `communityfund@stellar.org` to ask whether a revised Interest Form can still be considered for **SCF #46** (deadline date **9 November 2026**, timezone unpublished). If not, submit for the next open round.

## Track recommendation

**Open Track** — building a new Stellar-native order-settlement path for an existing consumer services app.  
Do not select Integration Track unless a concrete onchain metric + footprint is ready.

## Copy-paste answers (English)

### Project name
HAVKAR

### One-sentence description
HAVKAR is a multilingual consumer services platform (delivery, marketplace, jobs, events) that already ships a non-custodial Stellar wallet path; we seek Build funding to bind XLM payments to real service orders and launch that settlement on Mainnet.

### What are you building on Stellar?
A non-custodial order-payment flow: HAVKAR prepares an unsigned native XLM payment for a specific order; the user’s external wallet (e.g. LOBSTR) signs; HAVKAR validates the signed XDR and submits to Horizon only after checks pass. Horizon’s transaction hash becomes the payment proof on the order. HAVKAR never holds the user’s secret key.

### What already works (do not overclaim)
- Production app: https://havkar-app.vercel.app
- Wallet page with external wallet connect and XDR validation
- Verified Mainnet payment evidence (1 XLM):  
  https://horizon.stellar.org/transactions/31b7592078ec91730b417c920d8f63cf77613f49be1e5d60baf2dec7f2e9ce76
- Stellar customer Mainnet payments remain **disabled** in source until a separate checklist (`STELLAR_MAINNET_PAYMENTS_ENABLED = false`)
- Delivery / market / jobs do **not** yet create Stellar order settlements

### What funding would unlock
1. MVP: attach unsigned XLM payments to delivery/marketplace orders on Testnet  
2. Threat model + monitoring + failure/replay handling  
3. One Mainnet service-order payment path without custody of keys  

### Why Stellar (not superficial)
Stellar is the settlement rail for users who already hold or can receive XLM through wallets such as LOBSTR. The euro ledger inside HAVKAR stays separate. Stellar is not used as decorative storage; it is the payment confirmation source of truth for funded order settlement work.

### Traction / validated need (honest)
We do **not** claim verified user or revenue counts. Evidence of technical progress: working non-custodial wallet, Horizon Mainnet payment hash above, Italian registered business **HAVKAR DI JALILNIA AMIR** (Chamber of Commerce 3 November 2026). Product–market fit for Stellar order settlement is the funded thesis, not a claimed live metric.

### Team
Owner/authorized representative: Amir Jalilnia (fill ages, residence, second eligible individual before submit — handbook expects team capacity for webinars/demo).  
Do not invent additional team members.

### Legal entity
HAVKAR DI JALILNIA AMIR — Italy — registered 3 November 2026.

### Prior SCF status (mandatory honesty)
A previous Interest Form was reviewed and **did not meet Build Award requirements** (SCF email 16 October 2026, no project-specific feedback). This resubmission reflects: (1) registered Italian business, (2) clearer Stellar order-settlement scope vs wallet-only, (3) verified Horizon evidence, (4) explicit Mainnet-off truth, (5) tranche/budget discipline excluding past work and marketing.

### Referral code
(leave blank unless the owner has a real SCF referrer code)

### Approximate budget intent (for Interest Form if asked)
Target request about **USD 54,000** in XLM (not the $150k cap), subject to owner approval and full proposal invitation. Covers only future Stellar settlement engineering over ~16 weeks.

## Owner actions

1. Email `communityfund@stellar.org` about #46 same-round eligibility after rejection.
2. Complete second eligible individual + eligibility attestations.
3. Paste into https://communityfund.stellar.org/awards Interest Form.
4. Do **not** claim an invitation exists until SCF emails one.
5. Do **not** submit a full Build proposal without that invitation.
