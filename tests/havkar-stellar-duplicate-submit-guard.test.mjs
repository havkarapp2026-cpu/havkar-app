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
  clear() {
    this.map.clear();
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
const i18n = readFileSync(
  new URL("../havkar-ui-i18n21.js", import.meta.url),
  "utf8"
);
const doc = readFileSync(
  new URL(
    "../store/STELLAR_DUPLICATE_SUBMIT_GUARD_20261124.md",
    import.meta.url
  ),
  "utf8"
);

assert.doesNotMatch(source, /Keypair\.fromSecret/);
assert.match(source, /PAYMENT_LOCK_KEY/);
assert.match(source, /acquirePaymentLock/);
assert.match(source, /findRecentHorizonDuplicatePayment/);
assert.match(source, /findAnyRecentDuplicate/);
assert.match(source, /sourceGuard/);
assert.match(source, /Hash-idempotent/);
assert.match(source, /Never auto-build a new payment/);
assert.match(source, /localStorage\.setItem\(\s*PENDING_PAYMENT_KEY/);
assert.match(source, /sessionStorage\.setItem\(\s*PENDING_PAYMENT_KEY/);
assert.match(html, /allowRecentDuplicate/);
assert.match(
  html,
  /Client-side checks cannot guarantee global exactly-once payments/
);
assert.match(i18n, /An identical payment already confirmed recently/);
assert.match(i18n, /En identisk betalning har redan bekräftats nyligen/);
assert.match(i18n, /Client-side checks cannot guarantee global exactly-once/);
assert.match(doc, /exactly-once/);
assert.match(doc, /non-custodial/i);

const SOURCE = Keypair.random().publicKey();
const DEST = Keypair.random().publicKey();
const HASH = "b".repeat(64);

window.HAVKAR_STELLAR.connected = true;
window.HAVKAR_STELLAR.address = SOURCE;
window.havkarSetStellarNetwork?.("TESTNET");

// --- localStorage 15m duplicate ---
localStorage.setItem(
  "havkar_stellar_last_success_payment",
  JSON.stringify({
    at: Date.now(),
    hash: HASH,
    network: "TESTNET",
    source: SOURCE,
    destination: DEST,
    amount: "0.0100000",
    memo: "",
    kind: "payment"
  })
);

const recentLocal = await window.havkarFindRecentSuccessfulDuplicate({
  destination: DEST,
  amount: "0.01",
  memo: ""
});
assert.ok(recentLocal);
assert.equal(recentLocal.hash, HASH);
assert.equal(recentLocal.sourceGuard, "localStorage");

await assert.rejects(
  () =>
    window.havkarSignAndSubmitStellarPayment({
      destination: DEST,
      amount: "0.01",
      memo: ""
    }),
  /Identical payment already confirmed recently/i
);

// allowRecentDuplicate still requires wallet sign — but first fails lock if
// we only test that the duplicate throw is skipped when allowed and no pending.
// Clear last success so allowRecentDuplicate path can proceed to connect check.
localStorage.removeItem("havkar_stellar_last_success_payment");

// --- cross-tab lock ---
localStorage.setItem(
  "havkar_stellar_payment_lock",
  JSON.stringify({
    tabId: "other-tab-sim",
    at: Date.now()
  })
);
await assert.rejects(
  () =>
    window.havkarSignAndSubmitStellarPayment({
      destination: DEST,
      amount: "1",
      memo: "lock-test"
    }),
  /another browser tab/i
);
localStorage.removeItem("havkar_stellar_payment_lock");

// Stale lock from another tab is reclaimable
localStorage.setItem(
  "havkar_stellar_payment_lock",
  JSON.stringify({
    tabId: "stale-tab",
    at: Date.now() - 4 * 60 * 1000
  })
);
window.havkarAcquirePaymentLock();
const lockAfter = JSON.parse(
  localStorage.getItem("havkar_stellar_payment_lock")
);
assert.ok(lockAfter);
assert.notEqual(lockAfter.tabId, "stale-tab");
window.havkarReleasePaymentLock();
assert.equal(localStorage.getItem("havkar_stellar_payment_lock"), null);

// --- dual pending storage (refresh / reconnect recovery) ---
const pendingPayload = {
  network: "TESTNET",
  source: SOURCE,
  destination: DEST,
  amount: "1.0000000",
  memo: "pending-dual",
  kind: "payment",
  hash: "c".repeat(64),
  signedXdr: "AAAA",
  fee: "100",
  sequence: "1",
  timeBounds: {
    minTime: "0",
    maxTime: String(Math.floor(Date.now() / 1000) + 180)
  },
  maxTime: String(Math.floor(Date.now() / 1000) + 180)
};
window.havkarWritePendingPayment(pendingPayload);
assert.ok(sessionStorage.getItem("havkar_stellar_pending_payment"));
assert.ok(localStorage.getItem("havkar_stellar_pending_payment"));

// Simulate refresh: session wiped, local survives
sessionStorage.removeItem("havkar_stellar_pending_payment");
const recovered = window.havkarReadPendingPayment();
assert.ok(recovered);
assert.equal(recovered.hash, pendingPayload.hash);
assert.equal(recovered.memo, "pending-dual");
// Read restores session mirror
assert.ok(sessionStorage.getItem("havkar_stellar_pending_payment"));

window.havkarClearPendingPayment();
assert.equal(sessionStorage.getItem("havkar_stellar_pending_payment"), null);
assert.equal(localStorage.getItem("havkar_stellar_pending_payment"), null);

// --- concurrent tab lock while first tab holds lock ---
window.havkarAcquirePaymentLock();
await assert.rejects(
  async () => {
    const saved = localStorage.getItem("havkar_stellar_payment_lock");
    localStorage.setItem(
      "havkar_stellar_payment_lock",
      JSON.stringify({ tabId: "foreign", at: Date.now() })
    );
    try {
      window.havkarAcquirePaymentLock();
    } finally {
      localStorage.setItem("havkar_stellar_payment_lock", saved);
    }
  },
  /another browser tab/i
);
window.havkarReleasePaymentLock();

// --- expired pending clears; does not auto-create new payment without review ---
const expired = {
  ...pendingPayload,
  maxTime: String(Math.floor(Date.now() / 1000) - 30),
  timeBounds: {
    minTime: "0",
    maxTime: String(Math.floor(Date.now() / 1000) - 30)
  }
};
window.havkarWritePendingPayment(expired);
const readExpired = window.havkarReadPendingPayment();
assert.ok(readExpired);
// Sign path without connected wallet should clear expired and fail on connect,
// never silently invent a new signed payment.
await assert.rejects(
  () =>
    window.havkarSignAndSubmitStellarPayment({
      destination: DEST,
      amount: "1",
      memo: "pending-dual"
    }),
  /connect|not connected|wallet|Stellar/i
);
// After attempt, expired pending should be cleared (else branch of pendingStillOpen)
assert.equal(
  window.havkarReadPendingPayment()?.hash,
  undefined
);

// --- no local duplicate after clear (Horizon path may return null offline) ---
localStorage.clear();
sessionStorage.clear();

const recentNone = await window.havkarFindRecentSuccessfulDuplicate({
  destination: DEST,
  amount: "0.02",
  memo: ""
});
assert.equal(recentNone, null);

assert.match(source, /findRecentHorizonDuplicatePayment/);
assert.match(source, /horizonTransactionMemoText/);
assert.match(source, /Delayed signature \/ double-tap/);

// Re-seed local and confirm dialog strings exist for SV/EN packaging
assert.match(
  i18n,
  /Fortsätt bara om du medvetet vill skicka samma belopp igen/
);
assert.match(
  i18n,
  /Klientkontroller kan inte garantera globala exakt-en-gång-betalningar/
);

console.log(
  JSON.stringify({
    verified: true,
    guards: [
      "localStorage-15m",
      "cross-tab-lock",
      "dual-pending-storage",
      "stale-lock-reclaim",
      "expired-pending-clear",
      "no-secret-keys",
      "i18n-sv-en-duplicate-dialog"
    ],
    submitted_by_agent: false,
    mainnet_tx: false
  })
);
console.log("HAVKAR_STELLAR_DUPLICATE_SUBMIT_GUARD_OK");
process.exit(0);
