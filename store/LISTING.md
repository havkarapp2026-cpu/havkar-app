# HAVKAR store listing draft

This file prepares store text. It does not submit HAVKAR to Google Play or the App Store. No developer account, upload key, or Apple certificate is included.

## Identity

- App name: HAVKAR
- Android application id: online.havkar.app
- iOS bundle id: online.havkar.app
- Version: 1.0.0-beta (version code 1)
- Icon: assets/icons/havkar-icon-1024-20261022-v3.png
- Website: https://havkar-app.vercel.app
- Support: support@havkar.online
- Privacy draft: https://havkar-app.vercel.app/privacy.html
- Account deletion request: https://havkar-app.vercel.app/privacy-request.html

## Short description

HAVKAR is a multi-service app for account, language, support, and the free features that are switched on. Real payments are off.

## Full description

HAVKAR opens the live HAVKAR website inside a native Android and iOS project. Sign-up, sign-in, language, and the free pages use the real HAVKAR backend. The Android package is online.havkar.app and uses the HAVKAR icon.

Real card payments, Pi payments, Stellar mainnet, money transfer, currency trade, paid tickets, paid subscriptions, and paid AI stay off. Sending a privacy request does not delete the account by itself.

The native screens load the real web app. They are not a separate rewrite of every HAVKAR page. Google sign-in inside an embedded view can be rejected by Google. Email and password remain the path that the app keeps inside the view.

## Android artifacts

- Debug APK: signed only with the local Android debug key. It is not a Play upload key.
- Cloud release AAB: GitHub Actions workflow `Android release AAB` (`.github/workflows/android-release-aab.yml`). Owner steps and secret names: `store/ANDROID_CLOUD_BUILD.md`. The workflow does not publish to Play.
- Release AAB signing: `android/app/build.gradle.kts` reads signing from environment variables when all four are set:
  - `HAVKAR_UPLOAD_STORE_FILE`
  - `HAVKAR_UPLOAD_STORE_PASSWORD`
  - `HAVKAR_UPLOAD_KEY_ALIAS`
  - `HAVKAR_UPLOAD_KEY_PASSWORD`
- Repository secret `HAVKAR_UPLOAD_KEYSTORE_BASE64` supplies the keystore bytes to Actions; the runner writes a temp file for `HAVKAR_UPLOAD_STORE_FILE`.
- Without those values the release build stays unsigned. Do not invent an upload keystore in the repository.

## iOS

The Xcode project builds for the iOS Simulator with code signing turned off. A Mac, an Apple Developer team, and a real distribution certificate are required before TestFlight or the App Store. This repository does not create those.

## Privacy for the forms

Data the account flow can handle: name, email, password, language, content the person submits, and the session. The app does not request tracking permission. The privacy and terms pages are drafts for counsel, not a certification.

## Google Play Data safety draft

This is a preparation checklist. It is not a Play Console submission and it is not a completed declaration.

- Data collected through the account: email address, name the person enters, password handled by Supabase Auth, language, and content the person submits.
- Session: stored by the Supabase client in browser storage. The Android app does not add its own analytics SDK.
- Payments: card, Pi, Stellar mainnet, and paid AI are off. Do not declare an active payment processor while those switches stay off.
- Data sharing: Supabase (eu-west-1), Vercel (observed function region iad1), Google sign-in only if the person chooses it, and Google Gemini for signed-in AI text.
- Account deletion: the public page https://havkar-app.vercel.app/privacy-request.html stores a request. It does not delete the account immediately. Play’s account-deletion URL can point at that page only after the owner accepts that wording.
- Encryption in transit: the site is HTTPS. Android cleartext traffic is not permitted.
- Tracking: the Android manifest does not request the advertising id. Do not answer the tracking question as a completed declaration until counsel reviews it.

## Content rating and declarations

Do not submit an IARC questionnaire from this file. The owner must answer it in Play Console and App Store Connect. Observed facts for that answer:

- The native app is a WebView of the HAVKAR site.
- Users can create accounts and send messages or listings where those pages are enabled.
- Real-money payments are switched off.
- There is no advertising SDK in the Android manifest.
- User-generated content exists in the web app. The owner must decide the store answers for user interaction and moderation.

## Release signing

- Android upload key: not present in this environment. Do not generate one here. The release bundle built in this environment is unsigned.
- Apple distribution certificate and provisioning profile: not present. The iOS project has code signing turned off.

## Google Play app access

The review account is an existing confirmed email account. It has no admin role. Its password is not stored in this repository. Enter that existing password in Play Console.

```
amirjalilnia01@gmail.com
```

After this change is deployed, the server recognizes only that confirmed account and grants a test entitlement for HAVKAR AI text limits and 1K logo and image generation. The entitlement does not turn on card payments, Pi payments, Stellar mainnet, subscription checkout, or admin tools. Until the deploy is approved, paid image generation on the live site stays paused for every account.

## Screenshots

Do not invent store screenshots. Capture them from a signed build or from the public site after the draft pages are deployed. Required Play phone set should include Home, Buy & Sell home (2 columns), Buy & Sell Search/Explore (3 columns), Support, and login. A phone-sized capture of the live privacy draft alone is not a Play screenshot set.

## Owner-only remaining actions

1. Provide the Android upload keystore and the four `HAVKAR_UPLOAD_*` values, then build `./gradlew :app:bundleRelease` on a machine with Android SDK.
2. Create the Apple Developer team, distribution certificate, and App Store provisioning profile; turn signing back on in Xcode.
3. Upload AAB to Play Console closed testing and IPA/TestFlight to App Store Connect.
4. Complete Data safety, content rating, and store listing forms in each console.
5. Paste the review account password for `amirjalilnia01@gmail.com` into Play App Access after PR #118 is approved, deployed, and its migration is applied.
