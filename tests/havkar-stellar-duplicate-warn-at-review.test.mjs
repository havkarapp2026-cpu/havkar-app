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

assert.doesNotMatch(source, /Keypair\.fromSecret/);
assert.match(source, /REVIEW_MATCH_LOOKBACK_MS/);
assert.match(source, /findPaymentDuplicateNotice/);
assert.match(source, /withinGuardWindow/);
assert.match(html, /havkarFindPaymentDuplicateNotice/);
assert.match(html, /Duplicate payment warning/);
assert.match(html, /Matching payment found earlier/);
assert.match(html, /reviewHAVKARStellarPayment/);
assert.match(html, /confirmHAVKARStellarPayment/);
assert.match(
  html,
  /An identical peer payment was found outside the 15-minute automatic guard/
);
assert.match(i18n, /هشدار پرداخت تکراری/);
assert.match(i18n, /پرداخت هم‌سان قبلی پیدا شد/);
assert.match(i18n, /Varning för dubbel betalning/);

const SOURCE = Keypair.random().publicKey();
const DEST = Keypair.random().publicKey();
const HASH = "e".repeat(64);

window.HAVKAR_STELLAR.connected = true;
window.HAVKAR_STELLAR.address = SOURCE;
window.havkarSetStellarNetwork?.("TESTNET");

assert.equal(window.havkarRecentSuccessGuardMs, 15 * 60 * 1000);
assert.equal(window.havkarReviewMatchLookbackMs, 24 * 60 * 60 * 1000);

// Within 15m → guard severity
localStorage.setItem(
  "havkar_stellar_last_success_payment",
  JSON.stringify({
    at: Date.now() - 2 * 60 * 1000,
    hash: HASH,
    network: "TESTNET",
    source: SOURCE,
    destination: DEST,
    amount: "0.0100000",
    memo: "",
    kind: "payment"
  })
);

const guardNotice = await window.havkarFindPaymentDuplicateNotice({
  destination: DEST,
  amount: "0.01",
  memo: ""
});
assert.ok(guardNotice);
assert.equal(guardNotice.hash, HASH);
assert.equal(guardNotice.withinGuardWindow, true);
assert.equal(guardNotice.severity, "guard");

const recentHard = await window.havkarFindRecentSuccessfulDuplicate({
  destination: DEST,
  amount: "0.01",
  memo: ""
});
assert.ok(recentHard);
assert.equal(recentHard.hash, HASH);

// Outside 15m but still remembered locally → info notice, no hard block
localStorage.setItem(
  "havkar_stellar_last_success_payment",
  JSON.stringify({
    at: Date.now() - 52 * 60 * 1000,
    hash: HASH,
    network: "TESTNET",
    source: SOURCE,
    destination: DEST,
    amount: "0.0100000",
    memo: "",
    kind: "payment"
  })
);

const infoNotice = await window.havkarFindPaymentDuplicateNotice({
  destination: DEST,
  amount: "0.01",
  memo: ""
});
assert.ok(infoNotice);
assert.equal(infoNotice.hash, HASH);
assert.equal(infoNotice.withinGuardWindow, false);
assert.equal(infoNotice.severity, "info");

const noHard = await window.havkarFindRecentSuccessfulDuplicate({
  destination: DEST,
  amount: "0.01",
  memo: ""
});
assert.equal(noHard, null);

await assert.rejects(
  () =>
    window.havkarSignAndSubmitStellarPayment({
      destination: DEST,
      amount: "0.01",
      memo: "",
      allowRecentDuplicate: false
    }),
  /connect|not connected|wallet|Stellar|progress|tab/i
);

// Explicit approval still required: confirm path still uses confirm() dialogs in wallet.html
assert.match(html, /window\.confirm\(/);
assert.match(html, /allowRecentDuplicate/);
assert.match(html, /MAINNET · real XLM/);

console.log(
  JSON.stringify({
    verified: true,
    root_cause: {
      warning_stage_before: "confirm_only",
      warning_stage_after: "review_and_confirm",
      owner_tx_age_minutes_at_report: 52,
      within_15min_hard_guard: false,
      expected_without_fix: "no_review_banner_and_no_confirm_dialog"
    },
    submitted_by_agent: false,
    mainnet_tx: false
  })
);
console.log("HAVKAR_STELLAR_DUPLICATE_WARN_AT_REVIEW_OK");
process.exit(0);
