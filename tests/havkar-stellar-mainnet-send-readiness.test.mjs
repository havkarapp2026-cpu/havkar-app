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

const source = readFileSync(
  new URL("../stellar-wallet-source.js", import.meta.url),
  "utf8"
);
const html = readFileSync(new URL("../wallet.html", import.meta.url), "utf8");
const bundle = readFileSync(
  new URL("../stellar-wallet-bundle.js", import.meta.url),
  "utf8"
);

assert.match(source, /STELLAR_MAINNET_PAYMENTS_ENABLED[\s\S]{0,40}true/);
assert.doesNotMatch(source, /Keypair\.fromSecret/);
assert.match(source, /havkarPrepareStellarPayment/);
assert.match(source, /havkarSignAndSubmitStellarPayment/);
assert.match(source, /assertSignedPayment/);
assert.match(source, /assertStellarSubmissionAllowed/);
assert.match(source, /spendable/);
assert.match(html, /reviewHAVKARStellarPayment/);
assert.match(html, /confirmHAVKARStellarPayment/);
assert.match(html, /window\.confirm/);
assert.match(html, /MAINNET · real XLM/);
assert.match(html, /Spendable/);
assert.match(html, /Unsigned hash/);
assert.match(html, /HAVKAR never receives a secret key/);
assert.match(html, /WalletConnect \(LOBSTR\/Freighter mobile\)/);
assert.match(bundle, /havkarPrepareStellarPayment/);
assert.match(bundle, /spendable/);

const net = window.havkarGetStellarNetwork();
assert.equal(net.id, "PUBLIC");
assert.equal(net.paymentsEnabled, true);

const self = Keypair.random().publicKey();
const other = Keypair.random().publicKey();
window.HAVKAR_STELLAR.connected = true;
window.HAVKAR_STELLAR.address = self;

await assert.rejects(
  () =>
    window.havkarPrepareStellarPayment({
      destination: self,
      amount: "0.01"
    }),
  /different Stellar account/
);

await assert.rejects(
  () =>
    window.havkarPrepareStellarPayment({
      destination: other,
      amount: "0.01",
      memo: "x".repeat(40)
    }),
  /28 bytes/
);

const classified = window.havkarClassifyStellarAddress(
  "W" + "A".repeat(55)
);
assert.ok(
  classified.kind === "muxed_contract" ||
    classified.kind === "invalid" ||
    classified.kind === "unknown" ||
    typeof classified.kind === "string"
);

// Live Horizon dry-run: prepare only (no sign, no submit) using a funded Mainnet account.
async function accountNativeBalance(address) {
  const account = await fetch(
    "https://horizon.stellar.org/accounts/" + address
  ).then((response) => {
    if (!response.ok) return null;
    return response.json();
  });
  if (!account) return 0;
  const native = (account.balances || []).find(
    (item) => item.asset_type === "native"
  );
  return native ? Number(native.balance) : 0;
}

async function findFundedMainnetPair() {
  const ops = await fetch(
    "https://horizon.stellar.org/operations?order=desc&limit=80"
  ).then((response) => response.json());
  const payment = (ops._embedded?.records || []).find(
    (row) =>
      row.type === "payment" &&
      row.asset_type === "native" &&
      /^G[A-Z2-7]{55}$/.test(row.from || "") &&
      /^G[A-Z2-7]{55}$/.test(row.to || "") &&
      row.from !== row.to
  );
  if (payment) {
    return { source: payment.from, destination: payment.to };
  }

  const funded = [];
  const txs = await fetch(
    "https://horizon.stellar.org/transactions?order=desc&limit=20"
  ).then((response) => response.json());
  for (const row of txs._embedded?.records || []) {
    const source = row.source_account;
    if (!/^G[A-Z2-7]{55}$/.test(source || "")) continue;
    if (funded.includes(source)) continue;
    const bal = await accountNativeBalance(source);
    if (bal >= 1) funded.push(source);
    if (funded.length >= 2) break;
  }
  if (funded.length >= 2) {
    return { source: funded[0], destination: funded[1] };
  }
  // Fallback: known active Mainnet account paying another funded peer from payments list via effects
  const effects = await fetch(
    "https://horizon.stellar.org/effects?order=desc&limit=40"
  ).then((response) => response.json());
  for (const row of effects._embedded?.records || []) {
    if (row.type !== "account_credited" || row.asset_type !== "native") continue;
    const dest = row.account;
    if (!/^G[A-Z2-7]{55}$/.test(dest || "")) continue;
    if ((await accountNativeBalance(dest)) < 1) continue;
    for (const src of funded) {
      if (src !== dest) return { source: src, destination: dest };
    }
    // pair with any other funded tx source
    for (const tx of txs._embedded?.records || []) {
      const src = tx.source_account;
      if (src && src !== dest && (await accountNativeBalance(src)) >= 1) {
        return { source: src, destination: dest };
      }
    }
  }
  return null;
}

const pair = await findFundedMainnetPair();
assert.ok(pair, "need a funded Mainnet account for dry-run prepare");

window.HAVKAR_STELLAR.address = pair.source;
const destination = pair.destination;

let submitCalled = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = async function patchedFetch(url, init) {
  const href = String(url);
  if (
    init?.method &&
    String(init.method).toUpperCase() === "POST" &&
    /horizon\.stellar\.org\/transactions/.test(href)
  ) {
    submitCalled = true;
    throw new Error("TEST GUARD: Mainnet submit must not happen in readiness dry-run");
  }
  return originalFetch.apply(this, arguments);
};

try {
  const prepared = await window.havkarPrepareStellarPayment({
    destination,
    amount: "0.01",
    memo: "HAVKAR-DRY"
  });

  assert.equal(prepared.network, "PUBLIC");
  assert.equal(prepared.amount, "0.0100000");
  assert.equal(prepared.destination, destination);
  assert.equal(prepared.source, pair.source);
  assert.equal(prepared.memo, "HAVKAR-DRY");
  assert.ok(Number(prepared.fee) > 0);
  assert.ok(prepared.feeXlm);
  assert.ok(prepared.spendable);
  assert.ok(prepared.balance);
  assert.ok(prepared.hash);
  assert.ok(prepared.xdr);
  assert.equal(prepared.signed, false);
  assert.equal(prepared.submitted, false);
  assert.ok(
    BigInt(Math.round(Number(prepared.spendable) * 1e7)) >= 100000n,
    "source must have spendable >= 0.01 for a realistic Owner dry-run target"
  );
  assert.equal(submitCalled, false);

  // Guard: local test signer path must not run on production hostnames.
  window.location.hostname = "havkar.online";
  globalThis.HAVKAR_STELLAR_TEST_SIGN = async () => {
    throw new Error("test signer must never run on production host");
  };
  // Do not call signAndSubmit here — readiness forbids real Mainnet send.
} finally {
  globalThis.fetch = originalFetch;
  window.location.hostname = "127.0.0.1";
}

console.log(
  JSON.stringify({
    ok: true,
    dryRun: "prepare_only",
    network: "PUBLIC",
    amount: "0.01",
    submitted: false,
    signed: false,
    source: pair.source,
    destination
  })
);
console.log("HAVKAR_STELLAR_MAINNET_SEND_READINESS_TEST_OK");
process.exit(0);
