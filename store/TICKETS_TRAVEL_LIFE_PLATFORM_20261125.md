# HAVKAR Tickets → Travel Life Platform — Owner report (2026-11-25)

Branch: `cursor/tickets-travel-life-platform-d4b2`  
Base: latest `main` at branch creation (preserves #284 Events, #285 Travel live, #286 133 currencies+XLM)  
Production migration: **NOT applied** (Owner approval required)  
Merge: **NOT performed** (Owner approval required)  
No real Stripe / XLM / Omio payments executed in this mission.

---

## 1. Preserve existing capabilities

| Item | Status |
|------|--------|
| #284 Events (QR / capacity / seats / refunds) | ✅ Untouched Events module; Tickets only links out |
| #285 Journey HUD, geo consent, licensed cameras on map | ✅ Kept |
| #286 133 currencies + XLM selector | ✅ Kept |
| Map / Omio / Duffel test paths | ✅ Kept |
| Home 15 tiles + green identity | ✅ `index.html` not modified |

## 2. UX

| Item | Status |
|------|--------|
| Mode tiles auto-scroll to matching form | ✅ `show()` smooth-scroll + `#mode-*` hash |
| Professional from/to labels (city/station/country) | ✅ |
| Departure + optional return + passengers | ✅ flights already; Omio modes updated |
| IATA not mistranslated | ✅ Labels clarified; `translate="no"` / `notranslate` on code inputs; no glossary keys for MXP/FCO |
| Long technical copy collapsed | ✅ `<details>` on flight/combined/train/bus/ferry/taxi/hotel/personal/cameras/memories |
| New modes: personal / mytrips / cameras / memories / reminders | ✅ |

## 3. Personal car trips

| Item | Status |
|------|--------|
| Start / pause / resume / end | ✅ `havkar-travel-life.js` + UI |
| Live speed / distance / samples | ✅ consent-gated `watchPosition` |
| Offline IndexedDB queue + online sync | ✅ |
| Screen-off honesty (browser limits) | ✅ documented; Wake Lock best-effort |
| Multi-stop cloud planner | 🟡 UI waypoint field present; full multi-destination re-route uses existing trip planner / map — cloud `trip_stops` ready after migration |
| Native Android/iOS background GPS | 🟡 Requires OS permissions in native shells; not inventable in pure browser |

## 4. My trips history

| Item | Status |
|------|--------|
| Schema `user_trips` + RLS owner-only | ✅ migration file ready |
| List / filter / rename / delete / JSON export | ✅ UI wired |
| Annual distance stats | ✅ `yearlyStats` |
| Map overlay of past trips | 🟡 Points available after migration; map replay UI not fully polished |
| Cross-device persistence | 🟡 Needs Owner-approved prod migration + sign-in |

## 5. Memories

| Item | Status |
|------|--------|
| Private album + media tables + `travel-media` bucket RLS | ✅ in migration |
| Capture / gallery upload + compress | ✅ |
| Optional geo attach only with consent | ✅ |
| Share links / timeline map | 🟡 Schema has `share_token`; share UX not activated (default private) |
| Driver distraction | ✅ One-tap upload; no album browser while driving |

## 6. Reminders

| Item | Status |
|------|--------|
| Prefs table + UI toggles (email off by default) | ✅ |
| Actual anniversary push/email workers | 🟡 Prefs only — no cron/email sender enabled (no new paid service) |

## 7. Public cameras

| Item | Status |
|------|--------|
| Catalog of licensed sources (LTA, Digitraffic, Calgary, Datumfeed, curated YT) | ✅ `havkar-camera-catalog.js` mirrors `lib/map-camera-sources.cjs` |
| JPEG ≠ LIVE distinction | ✅ |
| New sources without license review | 🔴 Refused / not added |

## 8. Professional map

| Item | Status |
|------|--------|
| Existing street/sat/hybrid/traffic/rain/360/layers | ✅ Preserved from #285 |
| Fake routes / fake vehicle live | 🔴 Not invented |

## 9. Currencies & payments

| Item | Status |
|------|--------|
| 133 + XLM display | ✅ |
| Display ≠ payment ≠ settlement honesty | ✅ existing copy kept |
| Multi-currency Stripe charge beyond presentment | 🟡 Depends on Stripe account country/methods — no new fee activated |
| XLM Mainnet non-custodial / LOBSTR WC | ✅ Not modified this PR |
| Crypto→fiat conversion | 🔴 Not activated (needs licensed provider + Owner approval) |
| Real payment tests | 🔴 None executed |

## 10. Commercial partners

| Partner | Status (this environment) |
|---------|---------------------------|
| Omio public redirect | ✅ Works without secrets |
| `OMIO_AFFILIATE_ID` (= Impact media `7763968`) | 🟡 **Not bound** in env — Owner must bind; not invented |
| `OMIO_API_KEY` live search | 🟡 Missing — live API off |
| Duffel | 🟡 Test-mode search/order paths preserved; live booking Owner-gated |
| Booking.com affiliate | 🟡 No affiliate id invented |

## 11. Security & database

| Item | Status |
|------|--------|
| Additive migration `20261125120000_travel_life_platform.sql` | ✅ in repo |
| Owner-only RLS; no staff private-trip read | ✅ |
| GDPR export (JSON) + delete trip | ✅ client helpers |
| Prod apply / backup | 🟡 **Blocked until Owner approval** |

## 12. Cost controls (estimates, assumptions transparent)

Assumptions: free OSM/OSRM baseline; TomTom only when key present; media avg 2 MB compressed photo / trip; 10 track points/km; Supabase EU; email off by default.

| Active users / mo | Map+GPS API | DB+storage | Bandwidth media | Push/email | Rough total |
|-------------------|-------------|------------|-----------------|------------|-------------|
| 1 000 | €0–40 (OSM free / light TomTom) | €25–60 | €10–30 | €0–5 | **~€35–135** |
| 10 000 | €40–250 | €80–200 | €80–250 | €5–20 | **~€200–720** |
| 100 000 | €250–2 000 | €400–1 200 | €800–2 500 | €20–100 | **~€1.5k–5.8k** |
| 1 000 000 | €2k–15k+ | €2k–8k | €8k–25k | €100–800 | **~€12k–49k+** |

No new paid SaaS subscribed in this PR. Owner must approve any TomTom quota uplift, Supabase plan change, or email provider.

## 13. Tests & release

| Item | Status |
|------|--------|
| Automated static/unit tests (new + prior tickets suites) | ✅ run on agent |
| Cross-account RLS live on prod | 🟡 Needs migration applied first |
| Mobile/tablet manual GPS | 🟡 Partial — consent + HUD logic verified in code/tests; device GPS in field after merge |
| Production deploy / migration | 🔴 Not done (Owner gate) |

## 14. Owner actions required (single list)

1. Review and merge PR for `cursor/tickets-travel-life-platform-d4b2`.
2. Backup Supabase, then apply `supabase/migrations/20261125120000_travel_life_platform.sql` to production.
3. Bind `OMIO_AFFILIATE_ID=7763968` (Impact media partner) if tracked affiliate is desired — do **not** use advertiser/program catalog ids.
4. Provide `OMIO_API_KEY` only if live Omio API contract is ready.
5. Confirm any paid map/email quota changes before enabling reminder email workers.
6. Native background GPS: configure Android/iOS location permission strings when shipping store builds.
7. Do **not** enable crypto→fiat conversion until licensed provider + Owner approval.

---

PR number / commit / production URL: filled after push in the agent final report.
