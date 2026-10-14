import fs from "node:fs";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url);
const phrase = process.argv.slice(2).join(" ").trim();

function exists(relativePath) {
  return fs.existsSync(new URL(relativePath, root));
}

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, root), "utf8");
}

function envPresent(name) {
  return Boolean(process.env[name] && String(process.env[name]).trim());
}

const delivery = read("delivery.html");
const stellar = read("stellar-wallet-source.js");
const wallet = read("wallet.html");
const xcodebuild = spawnSync("xcodebuild", ["-version"], { encoding: "utf8" });

const gates = [
  {
    id: "debug-overlay",
    ok: !delivery.includes("HAVKAR DEBUG") && !delivery.includes("havkarDebugPanel"),
    detail: "Delivery debug overlay is absent from delivery.html."
  },
  {
    id: "stellar-mainnet-guard",
    ok: stellar.includes('throw new Error(\n            "Mainnet payments are protected. Use Testnet."\n        );')
      || stellar.includes("Mainnet payments are protected. Use Testnet."),
    detail: "Stellar payment submission still rejects the Public network."
  },
  {
    id: "pi-wallet-init",
    ok: wallet.includes("Public wallet does not load or initialize Pi."),
    detail: "Wallet page still does not initialize the Pi SDK."
  },
  {
    id: "privacy-policy",
    ok: exists("privacy.html"),
    detail: "Add the owner-approved privacy policy as privacy.html. A store privacy URL must point at the published page."
  },
  {
    id: "android-upload-key",
    ok: envPresent("HAVKAR_UPLOAD_STORE_FILE")
      && envPresent("HAVKAR_UPLOAD_STORE_PASSWORD")
      && envPresent("HAVKAR_UPLOAD_KEY_ALIAS")
      && envPresent("HAVKAR_UPLOAD_KEY_PASSWORD")
      && fs.existsSync(process.env.HAVKAR_UPLOAD_STORE_FILE),
    detail: "Provide the Play upload keystore through HAVKAR_UPLOAD_STORE_FILE, HAVKAR_UPLOAD_STORE_PASSWORD, HAVKAR_UPLOAD_KEY_ALIAS and HAVKAR_UPLOAD_KEY_PASSWORD."
  },
  {
    id: "ios-signing",
    ok: process.platform === "darwin" && xcodebuild.status === 0 && envPresent("HAVKAR_IOS_TEAM_ID"),
    detail: "Archive the iOS app on a Mac with Xcode, an Apple Developer team, and HAVKAR_IOS_TEAM_ID. This environment cannot sign an iOS release."
  },
  {
    id: "play-review",
    ok: exists("launch/google-play-review-accepted"),
    detail: "After Google Play accepts the release, the owner records that fact as launch/google-play-review-accepted. This file must not be created early."
  },
  {
    id: "app-store-review",
    ok: exists("launch/app-store-review-accepted"),
    detail: "After App Store review accepts the release, the owner records that fact as launch/app-store-review-accepted. This file must not be created early."
  },
  {
    id: "payments-unchanged",
    ok: exists("launch/payments-remain-unchanged"),
    detail: "The owner confirms in launch/payments-remain-unchanged that this launch does not switch Stripe, Pi, or Stellar to a new live mode."
  }
];

const failed = gates.filter((gate) => !gate.ok);

function report(status) {
  console.log(status);
  console.log("HAVKAR is not published. Google Play and the App Store are not contacted.");
  for (const gate of gates) {
    console.log(`${gate.ok ? "READY" : "BLOCKED"} ${gate.id}: ${gate.detail}`);
  }
}

if (phrase !== "ACTIVATE HAVKAR") {
  report("HAVKAR release is disabled. The authorization command was not given.");
  process.exit(2);
}

if (failed.length > 0) {
  report("ACTIVATE HAVKAR was received. Release stays disabled because required gates are incomplete.");
  process.exit(1);
}

report("Local gates passed. Store submission remains a manual review in Google Play Console and App Store Connect. This command does not upload a binary or change payment networks.");
process.exit(0);
