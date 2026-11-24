import { register } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Keypair } from "@stellar/stellar-sdk";

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

const source = readFileSync(new URL("../stellar-wallet-source.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../wallet.html", import.meta.url), "utf8");
const bundle = readFileSync(new URL("../stellar-wallet-bundle.js", import.meta.url), "utf8");

assert.match(source, /havkarVerifyStellarWalletChallenge/);
assert.match(source, /This is NOT a payment and moves no XLM/);
assert.match(html, /verifyHAVKARStellarChallenge/);
assert.match(html, /Verify signature \(no XLM\)/);
assert.match(bundle, /havkarVerifyStellarWalletChallenge/);

const wallets = window.havkarListPreferredStellarWallets();
const freighter = wallets.find((item) => item.id === "freighter");
const lobstr = wallets.find((item) => item.id === "lobstr");
assert.equal(freighter.challengeSign, "supported");
assert.equal(lobstr.challengeSign, "supported");
assert.match(freighter.notes, /WalletConnect/i);
assert.match(lobstr.notes, /WalletConnect|Android/i);
assert.match(freighter.connect, /Freighter|WalletConnect|extension/i);

await assert.rejects(
  () => window.havkarVerifyStellarWalletChallenge(),
  /Connect a Stellar wallet/
);

const kp = Keypair.random();
window.HAVKAR_STELLAR.connected = true;
window.HAVKAR_STELLAR.address = kp.publicKey();
localStorage.setItem("@StellarWalletsKit/selectedModuleId", "albedo");

await assert.rejects(
  () => window.havkarVerifyStellarWalletChallenge(),
  /Albedo does not support/
);

localStorage.setItem("@StellarWalletsKit/selectedModuleId", "lobstr");
let challengeCalls = 0;
globalThis.HAVKAR_STELLAR_TEST_SIGN_MESSAGE = async (message) => {
  challengeCalls += 1;
  assert.match(message, /NOT a payment/);
  assert.match(message, /moves no XLM/);
  return {
    signedMessage: "dGVzdC1zaWduYXR1cmUtbm90LWEtdHg=",
    signerAddress: kp.publicKey()
  };
};

const result = await window.havkarVerifyStellarWalletChallenge();
assert.equal(result.ok, true);
assert.equal(result.transferred, false);
assert.equal(result.submitted, false);
assert.equal(result.kind, "challenge_message");
assert.equal(result.method, "stellar_signMessage");
assert.equal(result.moduleId, "lobstr");
assert.equal(challengeCalls, 1);
assert.ok(result.signature.length > 8);

localStorage.setItem("@StellarWalletsKit/selectedModuleId", "freighter");
const freighterResult = await window.havkarVerifyStellarWalletChallenge();
assert.equal(freighterResult.moduleId, "freighter");
assert.equal(freighterResult.transferred, false);

// Production host must ignore the localhost test signer hook.
window.location.hostname = "havkar.online";
globalThis.HAVKAR_STELLAR_TEST_SIGN_MESSAGE = async () => {
  throw new Error("test signer must not run on production host");
};
localStorage.setItem("@StellarWalletsKit/selectedModuleId", "albedo");
await assert.rejects(
  () => window.havkarVerifyStellarWalletChallenge(),
  /Albedo does not support/
);

console.log("HAVKAR_STELLAR_WALLET_CHALLENGE_TEST_OK");
process.exit(0);
