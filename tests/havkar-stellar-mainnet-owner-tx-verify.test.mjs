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

const HASH =
  "a78337d9eefb5dc8c6ac7743efb9fd1a171b40338c14ea7473debc4c797acd4b";
const SOURCE =
  "GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM";
const DEST =
  "GAPCPQKBQ2VKSSRXUFOCGNUYEJLT3FRPYBCJCN2SJZ2TPLGEMMCUJV4L";

const source = readFileSync(
  new URL("../stellar-wallet-source.js", import.meta.url),
  "utf8"
);
const html = readFileSync(new URL("../wallet.html", import.meta.url), "utf8");
const record = readFileSync(
  new URL("../store/STELLAR_MAINNET_LOBSTR_WC_E2E_20261124.md", import.meta.url),
  "utf8"
);

assert.doesNotMatch(source, /Keypair\.fromSecret/);
assert.match(source, /tx_too_late/);
assert.match(source, /RECENT_SUCCESS_GUARD_MS|findRecentSuccessfulDuplicate/);
assert.match(source, /paymentInFlight/);
assert.match(source, /pendingStillOpen/);
assert.match(source, /WALLET_SIGNATURE_MS/);
assert.match(html, /allowRecentDuplicate|identical payment already confirmed/i);
assert.match(record, new RegExp(HASH));
assert.match(record, /LOBSTR/);
assert.match(record, /WalletConnect/);

const tx = await fetch(
  "https://horizon.stellar.org/transactions/" + HASH
).then((response) => {
  assert.equal(response.status, 200);
  return response.json();
});
assert.equal(tx.hash, HASH);
assert.equal(tx.successful, true);
assert.equal(tx.source_account, SOURCE);
assert.equal(String(tx.fee_charged), "100");
assert.equal(tx.ledger, 65653588);

const ops = await fetch(
  "https://horizon.stellar.org/transactions/" + HASH + "/operations"
).then((response) => response.json());
const payment = (ops._embedded?.records || []).find(
  (row) => row.type === "payment"
);
assert.ok(payment);
assert.equal(payment.from, SOURCE);
assert.equal(payment.to, DEST);
assert.equal(payment.amount, "0.0100000");
assert.equal(payment.asset_type, "native");

const explorer = window.havkarStellarExplorerTxUrl(HASH, "PUBLIC");
assert.match(explorer, /stellar\.expert\/explorer\/public\/tx\//);
assert.ok(explorer.includes(HASH));

// Duplicate-guard unit check (no network submit).
window.HAVKAR_STELLAR.connected = true;
window.HAVKAR_STELLAR.address = SOURCE;
localStorage.setItem(
  "havkar_stellar_last_success_payment",
  JSON.stringify({
    at: Date.now(),
    hash: HASH,
    network: "PUBLIC",
    source: SOURCE,
    destination: DEST,
    amount: "0.0100000",
    memo: "",
    kind: "payment"
  })
);
const recent = window.havkarFindRecentSuccessfulDuplicate({
  destination: DEST,
  amount: "0.01",
  memo: ""
});
assert.ok(recent);
assert.equal(recent.hash, HASH);

await assert.rejects(
  () =>
    window.havkarSignAndSubmitStellarPayment({
      destination: DEST,
      amount: "0.01",
      memo: ""
    }),
  /Identical payment already confirmed recently/i
);

// Ensure production host ignores test signer hooks (no real send).
window.location.hostname = "havkar.online";
globalThis.HAVKAR_STELLAR_TEST_SIGN = async () => {
  throw new Error("test signer must never run on production host");
};
assert.equal(typeof window.havkarSignAndSubmitStellarPayment, "function");

console.log(
  JSON.stringify({
    verified: true,
    hash: HASH,
    amount: "0.0100000",
    fee_stroops: 100,
    submitted_by_agent: false
  })
);
console.log("HAVKAR_STELLAR_MAINNET_OWNER_TX_VERIFY_OK");
process.exit(0);
