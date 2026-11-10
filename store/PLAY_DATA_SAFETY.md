# Google Play Data safety — accurate draft from current code

Preparation only. Does **not** submit to Play Console. Owner pastes answers after counsel review.

Re-verified 10 November 2026 against production `https://havkar.online/api/payment-activation-status` and repo sources.

## App facts (verified in repo / production gates)

| Fact | Evidence |
| --- | --- |
| Package | `online.havkar.app` |
| versionCode / versionName | `2` / `1.0.0` |
| targetSdk / compileSdk | 36 |
| Android permissions | `INTERNET` only (`AndroidManifest.xml`) |
| Advertising ID | Not requested |
| Analytics SDK | None in native project |
| WebView shell | Loads canonical `https://havkar.online/` |
| Card / Pi live collection | Off (`HAVKAR_REAL_PAYMENTS_ENABLED=false`, `HAVKAR_STRIPE_LIVE_ENABLED=false`) |
| Stellar Mainnet one-time XLM | **Armed** in Production (`HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=true`; wallet UI still defaults to Testnet) |
| Paid AI billing / Play Billing / IAP | Not armed (`billingUnavailable` in `havkar-ai.html`) |
| Duffel | Authenticated search + TEST MODE order API; live booking blocked server-side |

## Data collected (account / app)

| Data type | Collected? | Shared? | Purpose | Optional? |
| --- | --- | --- | --- | --- |
| Email | Yes (Auth) | Supabase Auth | Account | Required for account |
| Name / profile | Yes if entered | Supabase | Account / profile | Optional fields |
| Password | Handled by Supabase Auth (not stored by Android app) | Supabase | Auth | Required for email auth |
| User-generated content | Yes where modules enabled (ads, messages, listings, events, delivery, services, AI prompts) | Supabase DB; AI text/images also reach Google Gemini API | App functionality | User-initiated |
| Photos / files | Yes if user uploads (ads/marketplace/avatars/AI attachments) | Supabase Storage; AI attachments may be sent as base64 to Gemini | App functionality | User-initiated |
| Approximate location | Only if a web feature asks and user grants browser permission | Depends on feature | Feature | Optional |
| Payment info | Card numbers **not** collected while Stripe live flags stay off. Stellar payments use the user’s external wallet (no recovery phrase collected by HAVKAR). | Stellar Horizon when user pays an XLM quote; Stripe processors only after live flags | App functionality / settlement | User-initiated |
| Device IDs / advertising ID | No native collection | N/A | N/A | Answer no for advertising ID |

## Data sharing / processors (current Production)

- **Supabase** (`eu-west-1`): Auth, database, storage
- **Vercel**: Hosting / serverless API
- **Duffel**: Flight search/test orders when user is signed in and uses Tickets → Flights (server token)
- **Google** (optional): Sign-in if user chooses; Gemini for signed-in AI text/images via Edge Function `havkar-ai-assistant` → `generativelanguage.googleapis.com`
- **Stellar Horizon**: Testnet by default in Wallet UI; Mainnet settlement is Production-armed for enabled one-time flows

### Gemini and Play “Delas” (shared)

Play’s Service Provider exception applies only when the third party processes data solely on the developer’s behalf and not for its own purposes (for example model improvement). Google’s Gemini API unpaid/free terms allow Google to use prompts/responses to improve products; paid/Cloud DPA processing differs. **Until Owner confirms the exact Gemini billing/DPA mode in use, declare `Annat användargenererat innehåll → Delas = Ja` and treat AI image attachments under `Foton` the same way.** Do not select *Analyser* for this AI path; purpose is *Appfunktioner*.

Do **not** declare live Stripe/Pi card processors while `HAVKAR_REAL_PAYMENTS_ENABLED` / `HAVKAR_STRIPE_LIVE_ENABLED` remain false.

## Security practices

- Encryption in transit: HTTPS; Android cleartext disabled
- Account deletion request URL: `https://havkar.online/privacy-request.html` (stores request; not instant wipe)
- Independent security review: not claimed by this draft

## Content rating notes for IARC (owner answers in Console)

- Users can create accounts and post UGC where modules are enabled
- No gambling SDK
- Real-money card purchases currently off; Stellar Mainnet one-time XLM is armed separately
- No ads SDK in the Android package
- Account-level user blocking UI is still hidden/incomplete in `profile.html` (report-ad path exists)

## Owner-only Console actions still required

1. Paste these answers into Play Console Data safety form after counsel review
2. Complete IARC / content rating questionnaire
3. Upload screenshots from signed AAB or live site
4. Upload signed AAB (`versionCode` 2) to closed testing
5. Paste reviewer password for `amirjalilnia01@gmail.com` into App Access (`store/PLAY_APP_ACCESS.md`)
6. Complete Financial features declaration using `store/PLAY_FINANCIAL_FEATURES.md`
