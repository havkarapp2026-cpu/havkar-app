# Google Play Data safety — accurate draft from current code

Preparation only. Does **not** submit to Play Console. Owner pastes answers after counsel review.

## App facts (verified in repo / production gates)

| Fact | Evidence |
| --- | --- |
| Package | `online.havkar.app` |
| versionCode / versionName | `2` / `1.0.0` |
| targetSdk / compileSdk | 36 |
| Android permissions | `INTERNET` only (`AndroidManifest.xml`) |
| Advertising ID | Not requested |
| Analytics SDK | None in native project |
| WebView shell | Loads live HAVKAR site |
| Card / Pi / Stellar Mainnet / paid AI | Off until owner flags |
| Stellar | Testnet quote+verify only; Mainnet disabled in source |
| Duffel | Authenticated search + TEST MODE order API; live booking blocked server-side |

## Data collected (account / app)

| Data type | Collected? | Shared? | Purpose | Optional? |
| --- | --- | --- | --- | --- |
| Email | Yes (Auth) | Supabase Auth | Account | Required for account |
| Name / profile | Yes if entered | Supabase | Account / profile | Optional fields |
| Password | Handled by Supabase Auth (not stored by Android app) | Supabase | Auth | Required for email auth |
| User-generated content | Yes where modules enabled (ads, messages, listings, events, delivery, services) | Supabase DB | App functionality | User-initiated |
| Photos | Yes if user uploads (ads/marketplace/avatars) | Supabase Storage | App functionality | User-initiated |
| Approximate location | Only if a web feature asks and user grants browser permission | Depends on feature | Feature | Optional |
| Payment info | **Not** collected while real-payment flags stay off | N/A | N/A | Declare no active payment collection |
| Device IDs / advertising ID | No native collection | N/A | N/A | Answer no for advertising ID |

## Data sharing / processors (while features are on)

- **Supabase** (`eu-west-1`): Auth, database, storage
- **Vercel**: Hosting / serverless API
- **Duffel**: Flight search/test orders when user is signed in and uses Tickets → Flights (server token)
- **Google** (optional): Sign-in if user chooses; Gemini for signed-in AI text when that path is used
- **Stellar Horizon Testnet**: Only when user explicitly pays a Testnet XLM quote

Do **not** declare live Stripe/Pi/Mainnet processors while `HAVKAR_REAL_PAYMENTS_ENABLED` / Mainnet remain off.

## Security practices

- Encryption in transit: HTTPS; Android cleartext disabled
- Account deletion request URL: `https://havkar.online/privacy-request.html` (stores request; not instant wipe)
- Independent security review: not claimed by this draft

## Content rating notes for IARC (owner answers in Console)

- Users can create accounts and post UGC where modules are enabled
- No gambling SDK
- Real-money purchases currently off
- No ads SDK in the Android package

## Owner-only Console actions still required

1. Paste these answers into Play Console Data safety form
2. Complete IARC / content rating questionnaire
3. Upload screenshots from signed AAB or live site
4. Upload signed AAB (`versionCode` 2) to closed testing
5. Paste reviewer password for `amirjalilnia01@gmail.com` into App Access (`store/PLAY_APP_ACCESS.md`)
