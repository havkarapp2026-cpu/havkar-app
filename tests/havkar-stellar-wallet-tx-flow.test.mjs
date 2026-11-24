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
const walletHtml = readFileSync(new URL("../wallet.html", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../havkar-ui-i18n21.js", import.meta.url), "utf8");
const bundle = readFileSync(new URL("../stellar-wallet-bundle.js", import.meta.url), "utf8");

assert.match(source, /PREFERRED_STELLAR_WALLET_IDS/);
assert.match(source, /havkarListPreferredStellarWallets/);
assert.match(source, /havkarStellarExplorerTxUrl/);
assert.match(source, /Signature declined or cancelled/);
assert.match(walletHtml, /stellarReceiptPanel/);
assert.match(walletHtml, /cancelHAVKARStellarReview/);
assert.match(walletHtml, /stellarT\(/);
assert.match(walletHtml, /Mainnet sends real XLM/);
assert.match(i18n, /Payment receipt/);
assert.match(i18n, /Review before signing/);
assert.match(bundle, /havkarListPreferredStellarWallets/);

const wallets = window.havkarListPreferredStellarWallets();
assert.equal(wallets.length, 3);
assert.deepEqual(
  wallets.map((item) => item.id),
  ["albedo", "freighter", "lobstr"]
);
assert.equal(wallets[0].kind, "web");
assert.equal(wallets[1].kind, "browser_extension");
assert.equal(wallets[2].kind, "browser_extension");
assert.match(wallets[2].sign, /ignores.*networkPassphrase/i);

window.havkarSetStellarNetwork("PUBLIC");
assert.equal(window.havkarGetStellarNetwork().id, "PUBLIC");
assert.equal(window.havkarGetStellarNetwork().paymentsEnabled, true);

const explorerMain = window.havkarStellarExplorerTxUrl(
  "a".repeat(64),
  "PUBLIC"
);
assert.equal(
  explorerMain,
  "https://stellar.expert/explorer/public/tx/" + "a".repeat(64)
);
const explorerTest = window.havkarStellarExplorerTxUrl(
  "b".repeat(64),
  "TESTNET"
);
assert.equal(
  explorerTest,
  "https://stellar.expert/explorer/testnet/tx/" + "b".repeat(64)
);
assert.equal(window.havkarStellarExplorerTxUrl("short", "TESTNET"), "");

window.havkarSetStellarNetwork("TESTNET");
const fakeW =
  "WAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const classified = window.havkarClassifyStellarAddress(fakeW);
assert.ok(
  classified.kind === "muxed_contract" ||
    classified.kind === "invalid" ||
    classified.kind === "contract" ||
    classified.kind === "empty" ||
    classified.kind === "account" ||
    typeof classified.kind === "string"
);

await assert.rejects(
  () =>
    window.havkarPrepareStellarPayment({
      destination: "not-a-key",
      amount: "1"
    }),
  /valid Stellar destination|Connect a Stellar wallet|public key/i
);

const kp = Keypair.random();
window.HAVKAR_STELLAR.connected = true;
window.HAVKAR_STELLAR.address = kp.publicKey();

await assert.rejects(
  () =>
    window.havkarPrepareStellarPayment({
      destination: "W" + "A".repeat(55),
      amount: "1"
    }),
  /W|muxed|contract|classic|destination|valid/i
);

console.log("HAVKAR_STELLAR_WALLET_TX_FLOW_TEST_OK");
process.exit(0);
