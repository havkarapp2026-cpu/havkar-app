# Duffel Stays Access Request Pack — HAVKAR

## Current verified blocker (production)

| Field | Value |
|-------|-------|
| Endpoint probed | `POST https://api.duffel.com/stays/search` |
| Duffel-Version | `v2` |
| Token mode on Vercel Production | `duffel_test_` (test token) |
| HTTP status | **403 Forbidden** |
| Classification | `DUFFEL_STAYS_FORBIDDEN_ON_TEST_TOKEN` |
| Meaning | Flights test access is **not** sufficient. Stays is a separate Duffel product entitlement. |

Re-probe after deploy via:

```bash
curl -sS -X POST https://havkar.online/api/hotels \
  -H 'Content-Type: application/json' \
  -d '{"action":"hotels_duffel_probe"}'
```

Inspect `providers.duffel_stays.blocker_code`, `blocker_summary`, `duffel_errors`, `request_id`.

## What to request from Duffel

Ask Duffel Support / Account Manager to enable **Stays API** for the HAVKAR organization:

1. **Product:** Duffel Stays (accommodation search, rates, quotes, bookings).
2. **Environments:** Test token first (`duffel_test_…`), then Live (`duffel_live_…`) only after Owner authorization.
3. **Use case:** HAVKAR guest search aggregates Duffel Stays inventory separately from HAVKAR direct owner inventory (owners are **not** uploaded into Duffel).
4. **Geography:** Global guest search; company based in Italy (Crotone / EU).
5. **Settlement:** Clarify how supplier payments are funded for Stays bookings before HAVKAR offers XLM or live guest checkout for Duffel inventory.

## Organization / company details to attach

| Item | HAVKAR value |
|------|----------------|
| Product URL | https://havkar.online |
| Company | HAVKAR DI JALILNIA AMIR |
| Country | Italy (IT) |
| Support email | info@havkar.online |
| Stripe account | `acct_1UJwZZECWiUpELSP` (IT, EUR settlement) |
| Existing Duffel use | Flights (test token present; live flight orders separately gated) |

## Technical checklist after Duffel enables Stays

- [ ] Replace or extend token so Stays `POST /stays/search` returns **2xx** on test.
- [ ] Confirm rate/quote/booking endpoints with documented Stays flows.
- [ ] Keep `HAVKAR_HOTELS_LIVE_BOOKING_ENABLED` **false** until Owner approval.
- [ ] Keep XLM-for-Duffel-Stays **OFF** until supplier funding/settlement is verified.
- [ ] Do **not** push HAVKAR owner properties into Duffel.

## Suggested message to Duffel

> We operate HAVKAR (https://havkar.online), an Italian marketplace. We already use Duffel for flights testing.  
> `POST /stays/search` with our current test token returns **HTTP 403**.  
> Please enable **Duffel Stays API** access for our organization (test first).  
> We will keep Stays inventory separate from our direct property-owner inventory and will not enable public live hotel checkout until product access and settlement are confirmed.

## Owner gate reminder

Public hotel bookings and public hotel payments remain **OFF** until explicit Owner authorization.
