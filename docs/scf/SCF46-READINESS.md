# SCF #46 readiness notes

These notes record what was checked in the repository and on Horizon. They are not an SCF submission.

## Verified Mainnet transaction

Read from `https://horizon.stellar.org` on 2026-10-20:

| Field | Value |
| --- | --- |
| Hash | `31b7592078ec91730b417c920d8f63cf77613f49be1e5d60baf2dec7f2e9ce76` |
| Successful | true |
| Ledger | 65040002 |
| Created | 2026-10-20T08:43:13Z |
| Source | `GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM` |
| Destination | `GAPCPQKBQ2VKSSRXUFOCGNUYEJLT3FRPYBCJCN2SJZ2TPLGEMMCUJV4L` |
| Type | payment |
| Asset | native |
| Amount | 1.0000000 XLM |
| Fee | 100 stroops |
| Operations | 1 |

## What the code shows

Stellar wallet code lives in `stellar-wallet-source.js` and is loaded by `wallet.html`. Delivery and market pages do not submit Stellar payments. The euro ledger lives in `havkar-wallet.js` and the `wallets` tables.

Event tickets now have a separate Testnet checkout. It reuses external signing and does not call the wallet send function. The server stores the euro price, a public EUR-per-XLM quote, and the XLM amount. The buyer cannot choose the destination or mark the ticket paid. Confirmation requires a successful Testnet Horizon payment with one native operation, the stored amount, the stored destination, and the payment memo.

## Verified Testnet ticket payment

Read from `https://horizon-testnet.stellar.org` on 2026-10-20 after `node tests/stellar-ticket-payment.test.mjs`:

| Field | Value |
| --- | --- |
| Hash | `a72066cae5ac3dc3f58a20dcc5b25aa2d7abd0dc241ac8052f260cb83602c958` |
| Successful | true |
| Ledger | 5293395 |
| Created | 2026-10-20T10:02:42Z |
| Source | `GCZTBCLWODND3KFLIWVW6MAE2FEHJKTUUP364BHNGQQ5T35X7TFPWMPW` |
| Destination | `GDFQRPV5QGXEY2WAGA3LXMCNNCI2RNIEY4HAHDY7LAXLTABLR32DLX3N` |
| Amount | 0.1000000 native XLM |
| Memo | `hk1c690f5c2741a12e6c12a7fa` |
| Fee | 100 stroops |
| Operations | 1 |

This was a Friendbot-funded test payment. It is not a production ticket and it is not a Mainnet purchase.

## Not applied

`supabase/migrations/20261020095735_stellar_ticket_payments.sql` is in the repository only. It has not been applied. Production Supabase was not changed. The checkout returns a configuration error until `HAVKAR_STELLAR_TICKET_MERCHANT_PUBLIC_KEY` is set to a Testnet account that exists. The route never submits to `https://horizon.stellar.org`.

The language registry in `havkar-i18n.js` includes English, Persian, Arabic, Urdu, Kurdish Sorani, Kurdish Kurmanji, and the other codes in that file. Translation calls `/api/translate`. Google credentials are described there as server-side.

## What was not changed

This work did not change Mainnet payment controls, production Supabase data, billing, or production deployment. The new checkout cannot submit to Mainnet.
