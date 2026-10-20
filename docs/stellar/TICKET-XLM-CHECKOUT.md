# Event ticket XLM checkout

This is the first HAVKAR service checkout that can pay in XLM. It is Testnet only. It does not replace card checkout, and it does not change the wallet-page send path.

## Why event tickets

The repository already had a complete ticket checkout:

- `api/create-event-checkout.js` reads `events.price` on the server
- it inserts a pending `event_tickets` row with the service role
- `api/stripe-webhook.js` marks the ticket paid only after Stripe reports `payment_status = paid`
- authenticated users cannot insert a paid ticket or update a ticket

Delivery has a price column and no checkout API. Marketplace orders have an amount and no checkout API. Service bookings have no amount column. Tickets were the only service ready for a first integration.

## What stays in place

- `Get Ticket` still calls `/api/create-event-checkout`
- free tickets still use that route
- `havkarSignAndSubmitStellarPayment` still submits wallet-page payments
- `STELLAR_MAINNET_PAYMENTS_ENABLED` stays `true` for the wallet page
- the new signer, `havkarSignPreparedStellarXdr`, returns a signed XDR and does not submit
- that signer rejects every passphrase except `Test SDF Network ; September 2015`

## Payment steps

1. `POST /api/stellar-ticket-intent` checks the signed-in user, reloads the event, and ignores any amount or destination in the request.
2. The euro total is `events.price` times quantity. Quantity must be from 1 to 20.
3. The XLM amount is `ceil(euro / EUR-per-XLM)` in stroops. The quote comes from CoinGecko's public stellar/eur price. If the quote is missing, checkout stops.
4. The destination is `HAVKAR_STELLAR_TICKET_MERCHANT_PUBLIC_KEY`. The account must exist on `https://horizon-testnet.stellar.org`. The client cannot replace it. There is no organizer address column, so this is the HAVKAR merchant account, not a split to the organizer.
5. The server inserts a pending ticket with `payment_provider = stellar` and a pending `stellar_ticket_payments` row. The memo is `hk` plus 24 hex characters.
6. `POST /api/stellar-ticket-prepare` loads the buyer's Testnet account, checks the spendable balance, and returns an unsigned native payment. The time bound is 180 seconds. The quote is not recalculated.
7. The browser asks the connected wallet to sign that XDR. HAVKAR does not ask for a secret key.
8. `POST /api/stellar-ticket-submit` checks the signature, source, destination, native asset, stroop amount, memo, fee, sequence, hash, and time bounds. It submits only to Testnet Horizon, then reads the transaction and its operations again.
9. The ticket becomes `paid` and `valid` only after that read matches. A network error leaves the ticket pending. A rejected transaction marks the payment failed and leaves the ticket pending.
10. The same hash cannot be stored on a second payment. Submitting the same signed XDR again returns the existing receipt.

`GET /api/stellar-ticket-status` reads the caller's own row. It does not confirm a payment.

## Database

`supabase/migrations/20261020095735_stellar_ticket_payments.sql` is prepared and has not been applied.

The table allows only `network = 'TESTNET'`. Row level security lets an authenticated user select their own rows. There is no insert, update, or delete policy. Anonymous users have no privileges. The service role used by the API can select, insert, and update. It is not granted delete. Buyers cannot mark themselves confirmed.

The foreign keys use `ON DELETE RESTRICT`. A read-only check of production project `gispovnciifgikvgpzck` on 2026-10-20 found that `events` already deletes `event_tickets` with `ON DELETE CASCADE`, and an event owner can delete their own event. Linking this payment table with `CASCADE` would delete confirmed payment rows through that existing path. `RESTRICT` keeps the payment row and makes that delete fail instead.

Do not run this migration on production until the owner approves it.

## Backup

No backup was created or verified for this check. Supabase project details returned no backup id, file path, or checksum. Row counts below are a read-only inventory, not a backup.

Before the migration is applied, the owner needs a backup whose file location and checksum are recorded:

1. In the Supabase dashboard for project `gispovnciifgikvgpzck`, open Database → Backups and record the backup time. This repository check did not confirm that a backup is listed there.
2. Or create a logical dump with the database password the owner already holds. Do not commit the dump or the password. Keep the file outside this repository.
3. Record the SHA-256 of that file and confirm the dump lists `public.events`, `public.event_tickets`, `public.wallets`, and `public.wallet_transactions`.
4. Compare the dump's table counts with a fresh read-only count. On 2026-10-20 the production counts were: events 1, event_tickets 1, paid event_tickets 1, wallets 3, wallet_transactions 0.

Until step 3 has a real checksum, do not treat a backup as verified.

## Rollback

The migration is not in `supabase_migrations.schema_migrations`, and `public.stellar_ticket_payments` does not exist. The current rollback is to leave the file unapplied.

If it is later applied and `select count(*) from public.stellar_ticket_payments` is 0, the owner can remove only that new table:

```sql
DROP TABLE IF EXISTS public.stellar_ticket_payments;
```

If that count is greater than 0, do not drop the table. Stop using the ticket XLM routes and leave the rows in place. Dropping the table would delete the payment history this restriction is meant to keep. Do not drop `events`, `event_tickets`, `wallets`, or `wallet_transactions` as a rollback.

## Production configuration that is still missing

- Apply the migration
- Set `HAVKAR_STELLAR_TICKET_MERCHANT_PUBLIC_KEY` to a Testnet account that already exists
- Keep `SUPABASE_SERVICE_ROLE_KEY` on the server only
- Deploy the API routes
- A separate approval is required before any Mainnet destination or Mainnet submit is added

Until the merchant variable is set, the API returns `XLM checkout is not configured` and does not insert a ticket.

## Refunds

This checkout does not send a refund and does not let a buyer mark a refund. A confirmed Testnet payment would have to be refunded by a separate payment from the merchant wallet. That wallet is not held by the application.

## Tests

`node tests/stellar-ticket-payment.test.mjs` covers the server amount, a rejected signature, the wrong destination, the wrong amount, a Mainnet envelope, an expired bound, insufficient balance, an unknown destination, a duplicate hash, a network failure, and one real Testnet payment. The recorded hash is in `docs/scf/SCF46-READINESS.md`.

The test does not call `tests/stellar-wallet.test.mjs` and does not submit to Mainnet.
