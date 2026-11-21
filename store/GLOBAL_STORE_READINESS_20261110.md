# HAVKAR global store readiness — evidence report (10 November 2026)

No Production deploy, merge to `main`, store publish, or live card enablement was performed by the agent.

Branch: `cursor/havkar-global-store-ready-d4b2`

## Executive verdict

| Track | Verdict | Meaning |
| --- | --- | --- |
| **Android → Google Play production worldwide** | **BLOCKED** | Signed AAB artifact exists; Play Console Closed testing / 12 testers / 14-day / production upload **not verified** from this environment. |
| **iOS → App Store / TestFlight** | **BLOCKED** | Archive succeeds in CI; IPA export fails (cloud signing / missing App Store profile). |
| **Public Stripe / Pi card collection** | **OFF / paused** | Master flags false; webhook returns `REAL_PAYMENTS_PAUSED`. |
| **Stellar Mainnet one-time XLM** | **ARMED** | Production flag true; ownership verified; Wallet UI still defaults to Testnet. |
| **Legal policies** | **DRAFT** | Privacy/terms still labeled draft; counsel required. |

---

## 1) Platform / infrastructure status

| System | Status | Evidence |
| --- | --- | --- |
| GitHub repo `havkarapp2026-cpu/havkar-app` | Active | Branch work + CI runs listed below |
| Production web `https://havkar.online` | LIVE HTTP 200 on core pages | Curl probes 10 Nov 2026 |
| Vercel alias `havkar-app.vercel.app` | LIVE; redirects API to canonical host | Payment status 308→`havkar.online` |
| Supabase Production `gispovnciifgikvgpzck` (`eu-west-1`) | `ACTIVE_HEALTHY` | Supabase MCP `list_projects` |
| Supabase Staging `keglioewbkgdabsizvys` | `ACTIVE_HEALTHY` | Supabase MCP |
| Android package `online.havkar.app` | versionCode 2 / 1.0.0 / targetSdk 36 / `INTERNET` only | `android/app/build.gradle.kts`, Manifest |
| iOS bundle `online.havkar.app` | Xcode project + PrivacyInfo present | `scripts/ios-release-preflight.sh` PASS |

---

## 2) Feature matrix (PASS / FAIL / BLOCKED / NOT TESTED)

Legend: **PASS** = verified this audit with evidence. **FAIL** = broken vs expected. **BLOCKED** = cannot complete without Owner/external gate. **NOT TESTED** = no authenticated end-to-end exercise this run.

| Feature | Runtime state | Result | Evidence |
| --- | --- | --- | --- |
| Home / navigation | Active | **PASS** | Smoke UI `smoke-test-1-home.png`; HTTP 200 |
| Login UI (email + Google) | Active | **PASS** | `smoke-test-2-login.png`; HTTP 200 |
| Sign-up UI | Active (Create New Account) | **PASS** (UI only) | Login screenshot |
| Authenticated login success | Requires password | **NOT TESTED** | No password entered (by design) |
| Owner role / admin dashboard | Role-gated page live | **NOT TESTED** (auth) | `admin.html` HTTP 200; RPC-backed |
| Profile page | Active | **PASS** (page load) | HTTP 200; large profile HTML |
| Account-level user block | Incomplete / hidden | **FAIL** (incomplete) | `profile.html` comment: blocked until account-level blocking exists |
| Buy & Sell | Active listings UI | **PASS** (public UI) | `smoke-test-7-buy-sell.png` |
| Messaging / chat | Page live | **PASS** (page load) | HTTP 200 `chat.html` |
| Services | Page live | **PASS** (page load) | HTTP 200 |
| Jobs | Page live | **PASS** (page load) | HTTP 200 |
| Ads / business ads | Active + moderation RPC | **PASS** (static + tests) | `ads-production` tests PASS after test alignment; report via `create_ad_report` |
| Events | Page live | **PASS** (page load) | HTTP 200 |
| Tickets | Page live; Duffel TEST | **PASS** (page load) / live booking **BLOCKED** by design | HTTP 200; prior store docs |
| HAVKAR AI | Signed-in Edge Function; billing off | **PASS** (public gate UI) | `smoke-test-5-havkar-ai.png`; `billingUnavailable`; `ai-page-release` PASS |
| Media upload | WebView file chooser present | **NOT TESTED** (device upload) | Android `MainActivity` file chooser code |
| Global search page | Missing | **FAIL** | `https://havkar.online/search.html` → **404** |
| Account deletion | Request form only | **PASS** (request path) / instant delete **BLOCKED** | `smoke-test-4-privacy-request.png`; stores `privacy_requests` |
| Report ad abuse | Active | **PASS** (code + RPC) | `ad-view.html` → `create_ad_report` |
| Staff moderation of ads | Active on ad-view | **PASS** (code) | `moderate_advertisement` |

---

## 3) Payments / wallets

| Rail | Status | Result |
| --- | --- | --- |
| Stripe live account readiness (charges/payouts) | Account capable; **collection paused** | **BLOCKED** for live cards until Owner flags + exact-amount approval |
| Stripe webhook | Unsigned POST → `REAL_PAYMENTS_PAUSED` | **PASS** (pause enforced) |
| Play Billing / IAP | Not in native apps | **PASS** (absent) / digital AI paid plans **BLOCKED** for Play until Billing |
| Pi Network | Wallet screen disconnected for Mainnet Pi | **PASS** (disconnected messaging verified in UI source + screenshot) |
| Stellar Testnet | Default in Wallet UI | **PASS** |
| Stellar Mainnet XLM one-time | Production armed | **PASS** (API flags) — real spend **NOT TESTED** |
| Subscriptions / recurring XLM | Unsupported | **BLOCKED** by design |
| Crypto exchange / trade | Unsupported | **PASS** (not offered) |

Payment activation probe (`scripts/verify-payment-activation-gates.mjs`):

- `activation_status`: `paused`
- `stellar_mainnet_collection`: `armed`
- Stripe key mode reported live while customer-facing collection remains paused

---

## 4) Store compliance readiness

| Requirement | Android / Play | iOS / ASC |
| --- | --- | --- |
| Privacy policy URL | Live draft `privacy.html` — counsel required | Same |
| Account deletion URL | `privacy-request.html` (request, not instant wipe) | Same |
| Data safety / App Privacy | Draft in `PLAY_DATA_SAFETY.md`; Gemini Delas = Ja pending billing-mode confirm | `PrivacyInfo.xcprivacy` empty API/types (WebView shell); ASC nutrition labels still Owner |
| Financial features | Draft table `PLAY_FINANCIAL_FEATURES.md` | ASC financial / crypto disclosures Owner |
| UGC / reporting | Ad report + staff moderate exist; account block incomplete | Same web content |
| Permissions | `INTERNET` only | Review Info.plist / ATT as Owner |
| Payments policy | No Play Billing; keep digital IAP off | No StoreKit IAP |

---

## 5) Android packaging

| Item | Result |
| --- | --- |
| Signed AAB CI | run `42744481961` tag `havkar-android-signed-20261110a` **success** |
| Artifact | `havkar-app-release-signed-42744481961` · ~2.6 MB · **not expired** at audit |
| jarsigner `-strict` tests | **PASS** (`tests/android-aab-signing-verify.test.sh`) |
| Cleartext | Disabled |
| Start URL (this branch) | Canonicalized to `https://havkar.online/` |
| Play Console upload / closed testing | **NOT verified** |

---

## 6) iOS packaging

| Item | Result |
| --- | --- |
| Repo preflight | **PASS** |
| Latest signed attempt | run `42744829769` — ARCHIVE OK · EXPORT exit 70 |
| Error | `Cloud signing permission error` + `No profiles for 'online.havkar.app'` |
| `APPLE_PROVISIONING_PROFILE_BASE64` | Missing (prior audits) |
| IPA / TestFlight | **None** |
| Start URL (this branch) | Canonicalized to `https://havkar.online/` |

---

## 7) Security / secrets / dependencies

| Check | Result |
| --- | --- |
| `npm audit --omit=dev` | 0 vulnerabilities reported this run |
| RLS on core public tables | Enabled on listed business tables (Supabase MCP) |
| Advisors: RLS enabled, no policies | Present on rate-limit / private / webhook tables (often intentional deny-all for clients) |
| Advisor WARN: `event_interest_counts` executable by `anon` as SECURITY DEFINER | Noted — Owner/security follow-up |
| Advisor WARN: leaked password protection disabled | Owner should enable HaveIBeenPwned protection in Supabase Auth |
| Secrets printed | None |

---

## 8) Automated tests run this audit

| Suite | Result |
| --- | --- |
| `tests/ai-page-release.test.mjs` | PASS |
| `tests/legal-drafts.test.mjs` | PASS |
| `tests/play-review-entitlement.test.mjs` | PASS |
| `tests/privacy-request.test.mjs` | PASS |
| `tests/real-payments-pause.test.mjs` | PASS |
| `tests/stripe-card-path-dry-run.test.mjs` | PASS |
| `tests/android-aab-signing-verify.test.sh` | PASS |
| `scripts/ios-release-preflight.sh` | PASS |
| `scripts/verify-payment-activation-gates.mjs` | PASS (paused + mainnet armed) |
| `scripts/verify-stellar-mainnet-ops.mjs` | PASS structure |
| `scripts/verify-stripe-live-readiness.mjs` | Reports live activation **BLOCKED** (expected) |
| `tests/ads-production.test.mjs` | PASS after aligning admin moderation expectations |
| `tests/event-privacy.test.mjs` | PASS |
| `tests/stellar-checkout.test.mjs` | PASS |
| `tests/owner-eur1-checkout.test.mjs` | PASS |
| Android Gradle unit tests | **NOT TESTED** (no `ANDROID_HOME` in this VM) |

---

## 9) Safe fixes applied on this branch (no payment enablement)

1. Android + iOS WebView start URL → `https://havkar.online/`
2. Unit tests assert canonical start URL while still allowing `havkar-app.vercel.app` hosts
3. `tests/ads-production.test.mjs` aligned with current Owner Control + `ad-view` moderation architecture
4. Store drafts updated: `PLAY_DATA_SAFETY.md`, `PLAY_APP_ACCESS.md`, new `PLAY_FINANCIAL_FEATURES.md`, this report

---

## 10) Owner-only checklist (cannot be completed by the agent)

### Android / Play
1. Download signed AAB from Actions run `42744481961` (or rebuild signed on `main` after merge).
2. Upload to Play Closed testing; recruit ≥12 testers; keep track ≥14 days.
3. Paste Data safety + Financial features + App Access password + IARC + listing screenshots.
4. Promote production countries only after Google eligibility — agent will not publish.

### iOS / ASC
1. Create App Store Distribution profile for `online.havkar.app` **or** grant ASC cloud signing to the API key.
2. Add GitHub secret `APPLE_PROVISIONING_PROFILE_BASE64` if using manual profile export.
3. Re-run **iOS Release** `signed_ipa` / tag `havkar-ios-signed-*` until IPA artifact exists.
4. Upload TestFlight; public App Store submit only with explicit Owner approval.

### Legal / Auth / Payments
1. Counsel finalize privacy/terms (remove “draft”).
2. Visura / Partita IVA publication decision.
3. Enable Supabase Auth leaked-password protection.
4. Keep Stripe/Pi flags OFF until separate written activation + exact-amount approval.
5. Decide Gemini paid/DPA mode for Data safety Delas accuracy.
6. Confirm crypto-wallet country licensing answers for Play Financial features.
