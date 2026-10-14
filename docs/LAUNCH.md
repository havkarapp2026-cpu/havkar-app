# HAVKAR launch procedure

HAVKAR is not publicly launched. This document is the only release procedure. It does not upload a binary, deploy the website, change a database, or switch Stripe, Pi, or Stellar.

The owner authorizes the final check with this exact command:

```
ACTIVATE HAVKAR
```

The command runs:

```
node scripts/activate-havkar.mjs ACTIVATE HAVKAR
```

Until every gate below is actually complete, the command exits with an error and publishes nothing. Creating the approval files before Google or Apple has accepted the release is not allowed.

## What the current repository contains

- The website is the existing static HAVKAR app plus the `api/` functions. It is not rebuilt here.
- The Android and iOS projects are the existing Capacitor app, package `online.havkar.app`. The installed mobile screen is local account sign-in, language, camera, and on-device files. It does not contain Delivery, Wallet, Market, Trade, or the rest of the website.
- Android `versionName` is `1.0.1` and `versionCode` is `2`. iOS marketing version is `1.0` and build number is `1`.
- Stellar payment submission rejects the Public network with “Mainnet payments are protected. Use Testnet.” The stored default network is Testnet.
- The public wallet page does not initialize the Pi SDK.
- The Delivery debug overlay has been removed from `delivery.html`.
- `pi-a2u-test.html`, `pi-testnet-signin.html`, and `ai-assistant-test.html` stay in the repository for local tests. `vercel.json` redirects those three URLs to `/` on the next website deployment. This change is not deployed.

## Release signing

Android release tasks `bundleRelease` and `assembleRelease` stop unless all four values are present:

- `HAVKAR_UPLOAD_STORE_FILE`
- `HAVKAR_UPLOAD_STORE_PASSWORD`
- `HAVKAR_UPLOAD_KEY_ALIAS`
- `HAVKAR_UPLOAD_KEY_PASSWORD`

The debug build does not use this key. No upload keystore is stored in the repository.

iOS signing needs a Mac, Xcode, an Apple Developer team, and `HAVKAR_IOS_TEAM_ID`. The iOS project has no `DEVELOPMENT_TEAM`. This Linux environment cannot create a signed IPA.

## Gates the activation command checks

The command stays blocked until all of these exist:

1. `privacy.html` written and approved by the owner.
2. The Play upload key environment variables above, and the keystore file on disk.
3. A Mac with Xcode and `HAVKAR_IOS_TEAM_ID`.
4. `launch/google-play-review-accepted` created only after Play Console shows the release accepted.
5. `launch/app-store-review-accepted` created only after App Store Connect shows the version accepted.
6. `launch/payments-remain-unchanged` created by the owner to confirm this launch does not switch Stripe, Pi, or Stellar into a new live mode.

Passing the command after those gates still does not call Google Play, Apple, Vercel, or a payment network. Submission and rollout stay manual in the store consoles so review cannot be bypassed.

## Store listing facts from the current app

Android permissions in the manifest are `INTERNET` and `CAMERA`. Camera hardware is optional. iOS usage strings cover camera and photo library, and they say the selected file stays on the device. `ITSAppUsesNonExemptEncryption` is false. There is no privacy policy page, no Play feature graphic, and no phone screenshots in the repository. `icon.png` is 1024 by 1024.

The Data safety and App Privacy answers must match the real Supabase account data, camera files that stay on device, and any payment data the owner later approves. Those forms are completed by the owner in the consoles.

## Remaining sequence

1. Fix the Samsung WebView startup failure with device logcat before any store binary is treated as the full HAVKAR product.
2. Decide whether the store app remains the local account shell or loads the existing website. That decision is an owner decision and is not made here.
3. Publish the owner-approved privacy policy and support URL.
4. Create the Play upload key and the Apple distribution certificate outside this repository.
5. Build a signed AAB on a machine that has the upload key. Build a signed iOS archive on a Mac.
6. Upload both binaries in the closed testing tracks. Complete the store questionnaires. Wait for review.
7. Record the two review files and the payments confirmation only after the facts are true.
8. Run `ACTIVATE HAVKAR`. If the command still reports a blocked gate, do not roll out.
9. The owner personally starts the production rollout in Play Console and App Store Connect.
