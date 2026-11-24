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

assert.match(source, /stellar_signXDR/);
assert.match(source, /stellar_signMessage/);
assert.match(source, /Saknad eller ogiltig|missing\/invalid request method stellar_signMessage/i);
assert.match(source, /manageData/);
assert.match(source, /havkar_chal/);
assert.match(source, /verifyChallengeViaSignXdr/);
assert.match(source, /NEVER submitted/);
assert.match(html, /stellar_signXDR with a no-payment manageData challenge/);

const wallets = window.havkarListPreferredStellarWallets();
const lobstr = wallets.find((item) => item.id === "lobstr");
assert.equal(lobstr.challengeSign, "walletconnect_sign_xdr_only");
assert.match(lobstr.sign, /stellar_signXDR/);
assert.match(lobstr.sign, /stellar_signMessage is not implemented/i);

const kp = Keypair.random();
localStorage.setItem(
  "@StellarWalletsKit/selectedModuleId",
  "wallet_connect"
);
window.HAVKAR_STELLAR.connected = true;
window.HAVKAR_STELLAR.address = kp.publicKey();

// Message hook must NOT be used for LOBSTR-like WC without stellar_signMessage.
let messageHookCalls = 0;
globalThis.HAVKAR_STELLAR_TEST_SIGN_MESSAGE = async () => {
  messageHookCalls += 1;
  throw new Error("Saknad eller ogiltig request()-metod: stellar_signMessage");
};

let xdrHookCalls = 0;
globalThis.HAVKAR_STELLAR_TEST_SIGN_TRANSACTION = async (unsignedXdr, prepared) => {
  xdrHookCalls += 1;
  const tx = TransactionBuilder.fromXDR(
    unsignedXdr,
    prepared.network.passphrase
  );
  assert.equal(tx.operations.length, 1);
  assert.equal(tx.operations[0].type, "manageData");
  assert.equal(tx.operations[0].name, "havkar_chal");
  assert.notEqual(tx.operations[0].type, "payment");
  tx.sign(kp);
  return { signedTxXdr: tx.toXDR() };
};

const prepared = await window.havkarBuildStellarWalletChallengeTransaction({
  account: new Account(kp.publicKey(), "10"),
  nonce: "unit-test-nonce"
});
assert.match(prepared.unsignedXdr, /^AAAA/);
assert.equal(prepared.operation, "manageData:havkar_chal");

const result = await window.havkarVerifyStellarWalletChallenge({
  account: new Account(kp.publicKey(), "10"),
  nonce: "unit-test-nonce",
  forceXdr: true
});

assert.equal(result.ok, true);
assert.equal(result.transferred, false);
assert.equal(result.submitted, false);
assert.equal(result.moduleId, "wallet_connect");
assert.equal(result.method, "stellar_signXDR");
assert.equal(result.kind, "challenge_xdr");
assert.equal(xdrHookCalls, 1);
assert.equal(messageHookCalls, 0);
assert.ok(result.signature.length > 8);
assert.match(result.note, /NEVER submitted/i);
assert.ok(result.signedTxXdr);

// Session claims stellar_signMessage, wallet rejects → auto-fallback to XDR.
const originalList = window.havkarListWalletConnectMethods;
window.havkarListWalletConnectMethods = async () => [
  "stellar_signXDR",
  "stellar_signMessage"
];
xdrHookCalls = 0;
messageHookCalls = 0;
const fallbackOk = await window.havkarVerifyStellarWalletChallenge({
  account: new Account(kp.publicKey(), "12"),
  nonce: "fallback-ok"
});
assert.equal(fallbackOk.method, "stellar_signXDR");
assert.equal(fallbackOk.submitted, false);
assert.equal(fallbackOk.transferred, false);
assert.ok(xdrHookCalls >= 1);
assert.ok(messageHookCalls >= 1);
window.havkarListWalletConnectMethods = originalList;

console.log("HAVKAR_STELLAR_LOBSTR_WC_SIGN_CHALLENGE_TEST_OK");
process.exit(0);
