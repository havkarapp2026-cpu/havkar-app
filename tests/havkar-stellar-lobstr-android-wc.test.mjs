import { register } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  Account,
  Keypair,
  TransactionBuilder
} from "@stellar/stellar-sdk";

register("./freighter-esm-hook.mjs", import.meta.url);

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(String(key), String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
Object.defineProperty(globalThis, "navigator", {
  value: {
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    vendor: "Google Inc."
  },
  configurable: true
});
globalThis.location = {
  hostname: "127.0.0.1",
  href: "http://127.0.0.1/wallet.html"
};
globalThis.window = globalThis;
globalThis.open = () => null;
if (typeof globalThis.addEventListener !== "function") {
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.dispatchEvent = () => true;
}
if (typeof globalThis.CustomEvent !== "function") {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, init = {}) {
      super(type);
      this.detail = init.detail;
    }
  };
}

function element(tag = "") {
  const node = {
    style: { setProperty() {} },
    dataset: {},
    textContent: "",
    tagName: String(tag).toUpperCase(),
    childNodes: [],
    firstChild: null,
    nextSibling: null,
    parentNode: null,
    data: "",
    content: null,
    innerHTML: "",
    setAttribute() {},
    getAttribute() {
      return "";
    },
    getAttributeNames() {
      return [];
    },
    hasAttributes() {
      return false;
    },
    removeAttribute() {},
    appendChild() {},
    append() {},
    prepend() {},
    replaceWith() {},
    remove() {},
    insertBefore(child) {
      return child;
    },
    addEventListener() {},
    removeEventListener() {}
  };
  node.content = node;
  return node;
}

globalThis.document = {
  title: "",
  documentElement: element(),
  head: element(),
  body: element(),
  addEventListener() {},
  removeEventListener() {},
  createElement: element,
  createComment: element,
  createTextNode(text) {
    const node = element();
    node.data = String(text);
    node.textContent = node.data;
    return node;
  },
  createTreeWalker() {
    return {
      currentNode: null,
      nextNode() {
        return null;
      }
    };
  },
  importNode(node) {
    return node;
  },
  getElementsByTagName() {
    return [];
  },
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  }
};

await import("../stellar-wallet-source.js");

const source = readFileSync(
  new URL("../stellar-wallet-source.js", import.meta.url),
  "utf8"
);
const html = readFileSync(new URL("../wallet.html", import.meta.url), "utf8");
const bundle = readFileSync(
  new URL("../stellar-wallet-bundle.js", import.meta.url),
  "utf8"
);

assert.equal(window.havkarIsLikelyMobileBrowser(), true);

assert.match(source, /HAVKAR_STELLAR_APPKIT_NETWORKS/);
assert.match(source, /stellar:pubnet/);
assert.match(source, /76a3d548a08cf402f5c7d021f24fd2881d767084b387a5325df88bc3d4b6f21b/);
assert.match(source, /appKitOptions/);
assert.match(source, /includeWalletIds/);
assert.match(source, /EXTENSION_ONLY_WALLET_IDS/);
assert.match(source, /havkarConnectStellarWalletConnect/);
assert.match(source, /showInstallLabel:!mobile/);
assert.match(source, /hideUnsupportedWallets:mobile/);

assert.match(html, /connectHAVKARLobstrWalletConnect/);
assert.match(html, /Connect LOBSTR via WalletConnect/);
assert.match(html, /refreshMobileLobstrConnectUi/);
assert.match(html, /Android LOBSTR is the mobile app/);

assert.match(bundle, /stellar:pubnet/);
assert.match(bundle, /havkarConnectStellarWalletConnect/);
assert.match(bundle, /76a3d548a08cf402f5c7d021f24fd2881d767084b387a5325df88bc3d4b6f21b/);

const wallets = window.havkarListPreferredStellarWallets();
const lobstr = wallets.find((item) => item.id === "lobstr");
const freighter = wallets.find((item) => item.id === "freighter");
assert.equal(lobstr.kind, "walletconnect_mobile");
assert.equal(freighter.kind, "walletconnect_mobile");
assert.match(lobstr.connect, /WalletConnect/);
assert.match(lobstr.connect, /Do not use the extension Install row/);
assert.match(lobstr.notes, /stellar_signXDR|manageData|stellar_signMessage/i);

const explorerEvm = await fetch(
  "https://explorer-api.walletconnect.com/v3/wallets?projectId=8c21324f756127dbb906a072cc18f7e6&entries=5&page=1&search=lobstr&chains=eip155%3A1"
);
const evmJson = await explorerEvm.json();
assert.equal(
  evmJson.total,
  0,
  "eip155:1 must not list LOBSTR (root cause of No Wallet found)"
);

const explorerStellar = await fetch(
  "https://explorer-api.walletconnect.com/v3/wallets?projectId=8c21324f756127dbb906a072cc18f7e6&entries=5&page=1&search=lobstr&chains=stellar%3Apubnet"
);
const stellarJson = await explorerStellar.json();
assert.ok(
  stellarJson.total >= 1,
  "stellar:pubnet must list LOBSTR Wallet"
);
assert.ok(
  stellarJson.listings?.[
    "76a3d548a08cf402f5c7d021f24fd2881d767084b387a5325df88bc3d4b6f21b"
  ],
  "LOBSTR WalletConnect explorer id must be present"
);

const kp = Keypair.random();
localStorage.setItem(
  "@StellarWalletsKit/selectedModuleId",
  "wallet_connect"
);
window.HAVKAR_STELLAR.connected = true;
window.HAVKAR_STELLAR.address = kp.publicKey();

let messageCalls = 0;
globalThis.HAVKAR_STELLAR_TEST_SIGN_MESSAGE = async () => {
  messageCalls += 1;
  throw new Error("Saknad eller ogiltig request()-metod: stellar_signMessage");
};

let xdrCalls = 0;
globalThis.HAVKAR_STELLAR_TEST_SIGN_TRANSACTION = async (unsignedXdr, prepared) => {
  xdrCalls += 1;
  const tx = TransactionBuilder.fromXDR(
    unsignedXdr,
    prepared.network.passphrase
  );
  assert.equal(tx.operations[0].type, "manageData");
  tx.sign(kp);
  return { signedTxXdr: tx.toXDR() };
};

const result = await window.havkarVerifyStellarWalletChallenge({
  account: new Account(kp.publicKey(), "7"),
  nonce: "android-wc"
});
assert.equal(result.ok, true);
assert.equal(result.transferred, false);
assert.equal(result.submitted, false);
assert.equal(result.moduleId, "wallet_connect");
assert.equal(result.method, "stellar_signXDR");
assert.equal(xdrCalls, 1);
assert.equal(messageCalls, 0);

console.log("HAVKAR_STELLAR_LOBSTR_ANDROID_WC_TEST_OK");
process.exit(0);
