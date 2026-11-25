# HAVKAR Tickets travel final gaps — Owner report (2026-11-25)

Branch: `cursor/tickets-travel-final-gaps-d4b2`  
Base: `main` (post-#289)

## Status

| # | Topic | Status | Evidence |
|---|--------|--------|----------|
| 1 | Real anniversary / album / yearly reminders (in-app + email, opt-in) | ✅ code + daily cron | `lib/travel-life-api.cjs` expands kinds; `vercel.json` cron `20 6 * * *` → `/api/travel-life?action=dispatch_reminders`; accepts `x-vercel-cron:1` (same as jobs settle). Resend already present on prod. |
| 2 | Background / screen-off GPS Android+iOS | ✅ native bridges | Android `TravelLocationService` FGS + `HAVKAR_ANDROID_TRAVEL` JS bridge; iOS `TravelLocationBridge` + Always/background modes. Web browser alone still cannot guarantee screen-off. |
| 3 | Offline route store + sync | ✅ | IndexedDB queue for points + stops + trip patches; `local_trips` store; native drain into sync; Tickets “Sync offline + native GPS queue”. |
| 4 | Omio / Duffel | 🟡 honest status | UI loads live `external_integrations_status`: Omio affiliate yes / API key no / live off; Duffel test token / live orders off. No invented keys. |
| 5 | 133 currencies + XLM real pay | 🟡 honesty preserved | Matrix count 133 + XLM rail; display ≠ payment ≠ EUR settlement. No unverified per-currency charge claims. |
| 6 | Travel Plus €4.99 / 30-day trial | ✅ scaffold; sales OFF | `lib/havkar-travel-plus.cjs` free GPS preserved, cancel/renew terms documented, `sales_enabled=false`. **Owner must approve before arming checkout.** |
| 7 | Free features preserved | ✅ | Personal GPS, My trips, memories, reminders stay on free tier list. |
| 8 | Security / functional tests | ✅ targeted | `tests/tickets-travel-final-gaps.test.mjs` + prior travel-complete suite. No real payments. |

## Owner actions still required (no auto spend)

1. Confirm production cron fires (Hobby plan allows the second cron). Optional: set `CRON_SECRET` / `HAVKAR_TRAVEL_REMINDER_CRON_SECRET` for manual invoke.
2. Ship new Android/iOS store builds so FGS / CLLocation bridges reach users.
3. Bind `OMIO_API_KEY` and Duffel live token only with contracts; keep live flags off until then.
4. Approve before enabling Travel Plus Stripe price / checkout / auto-renew (would create real billing).
5. FCM/web-push for device “push” channel remains prefs-only until Owner arms push infra.

## Costs

No new paid infrastructure activated in this PR. Cron uses existing Vercel Hobby quota. Resend uses existing key. No Stripe Travel Plus product created. No real payment tests.

## Tests run

```
node --test tests/tickets-travel-final-gaps.test.mjs tests/tickets-travel-complete.test.mjs tests/map-pro-toolbar-plus.test.mjs
```
