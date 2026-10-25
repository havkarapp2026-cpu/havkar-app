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
- Release AAB: build it unsigned. Do not invent an upload keystore.

## iOS

The Xcode project builds for the iOS Simulator with code signing turned off. A Mac, an Apple Developer team, and a real distribution certificate are required before TestFlight or the App Store. This repository does not create those.

## Privacy for the forms

Data the account flow can handle: name, email, password, language, content the person submits, and the session. The app does not request tracking permission. The privacy and terms pages are drafts for counsel, not a certification.

## Screenshots

Do not invent store screenshots. Capture them from a signed build or from the public site after the draft pages are deployed.
