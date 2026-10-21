import { readFileSync } from "node:fs";
import { register } from "node:module";
import {
    Account,
    Horizon,
    Keypair,
    Networks,
    NotFoundError,
    TransactionBuilder
} from "@stellar/stellar-sdk";

const assert = {
    equal(actual, expected, label) {
        if (actual !== expected) {
            throw new Error(`${label || "assert"}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
        }
    },
    ok(value, label) {
        if (!value) {
            throw new Error(label || "expected a truthy value");
        }
    },
    async rejects(fn, pattern) {
        try {
            await fn();
        } catch (error) {
            if (!pattern.test(error.message || "")) {
                throw new Error(`Unexpected rejection: ${error.message}`);
            }
            return;
        }
        throw new Error(`Expected rejection matching ${pattern}`);
    }
};

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
    href: "http://127.0.0.1/wallet.html",
    origin: "http://127.0.0.1"
};
globalThis.window = globalThis;
globalThis.open = () => null;
if (typeof globalThis.addEventListener !== "function") {
    globalThis.addEventListener = () => {};
    globalThis.removeEventListener = () => {};
    globalThis.dispatchEvent = () => true;
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
        getAttribute() { return ""; },
        getAttributeNames() { return []; },
        hasAttributes() { return false; },
        removeAttribute() {},
        appendChild() {},
        append() {},
        prepend() {},
        replaceWith() {},
        remove() {},
        insertBefore(child) { return child; },
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
            nextNode() { return null; }
        };
    },
    importNode(node) { return node; },
    getElementsByTagName() { return []; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
};

if (typeof globalThis.CustomEvent !== "function") {
    globalThis.CustomEvent = class CustomEvent extends Event {
        constructor(type, init = {}) {
            super(type);
            this.detail = init.detail;
        }
    };
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
    const target = String(url);
    if (
        target.includes("horizon") ||
        target.includes("friendbot") ||
        target.includes("stellar.org")
    ) {
        throw new Error(`Network call blocked: ${target}`);
    }
    return originalFetch(url);
};

register("./freighter-esm-hook.mjs", import.meta.url);
await import("../stellar-wallet-source.js");

const calls = { submit: 0 };
const missingAccounts = new Set();

Horizon.Server.prototype.loadAccount = async function(id) {
    if (missingAccounts.has(id)) {
        throw new NotFoundError("missing", { status: 404 });
    }
    const account = new Account(id, "1000");
    account.balances = [{
        asset_type: "native",
        balance: "25.0000000",
        selling_liabilities: "0.0000000"
    }];
    account.subentry_count = 0;
    account.num_sponsoring = 0;
    account.num_sponsored = 0;
    return account;
};

Horizon.Server.prototype.ledgers = function() {
    return {
        order() { return this; },
        limit() { return this; },
        async call() {
            return {
                records: [{
                    base_reserve_in_stroops: "5000000",
                    base_fee_in_stroops: "100"
                }]
            };
        }
    };
};

Horizon.Server.prototype.submitTransaction = async function() {
    calls.submit += 1;
    throw new Error("mock submit blocked");
};

Horizon.Server.prototype.transactions = function() {
    return {
        transaction() {
            return { async call() { return null; } };
        }
    };
};

const sourceText = readFileSync(new URL("../stellar-wallet-source.js", import.meta.url), "utf8");
const bundleText = readFileSync(new URL("../stellar-wallet-bundle.js", import.meta.url), "utf8");
const lobstrText = readFileSync(
    new URL("../node_modules/@creit.tech/stellar-wallets-kit/esm/sdk/modules/lobstr.module.js", import.meta.url),
    "utf8"
);
const walletConnectText = readFileSync(
    new URL("../node_modules/@creit.tech/stellar-wallets-kit/esm/sdk/modules/wallet-connect.module.js", import.meta.url),
    "utf8"
);
const extensionText = readFileSync(
    new URL("../node_modules/@lobstrco/signer-extension-api/build/index.min.js", import.meta.url),
    "utf8"
);
const walletHtml = readFileSync(new URL("../wallet.html", import.meta.url), "utf8");

assert.equal(
    /STELLAR_MAINNET_PAYMENTS_ENABLED\s*=\s*false/.test(sourceText),
    true,
    "mainnet flag"
);
assert.equal(
    sourceText.includes("function assertStellarSubmissionAllowed"),
    true,
    "submission guard"
);
assert.equal(bundleText.includes("STELLAR_MAINNET_PAYMENTS_ENABLED = false"), true, "bundle flag");
assert.equal(bundleText.includes("function assertStellarSubmissionAllowed"), true, "bundle guard");
const submitAt = sourceText.lastIndexOf("await server.submitTransaction");
const guardAt = sourceText.lastIndexOf("assertStellarSubmissionAllowed", submitAt);
assert.equal(guardAt > sourceText.indexOf("async function havkarSignAndSubmitStellarPayment") && guardAt < submitAt, true, "guard runs before submit");
assert.equal(
    sourceText.includes("Public Global Stellar Network ; September 2015"),
    true,
    "mainnet passphrase"
);
assert.equal(
    sourceText.includes('horizon:"https://horizon.stellar.org"'),
    true,
    "mainnet horizon"
);
assert.equal(
    sourceText.includes('horizon:"https://horizon-testnet.stellar.org"'),
    true,
    "testnet horizon"
);
assert.equal(sourceText.includes("signAndSubmitTransaction"), false, "HAVKAR does not ask a wallet to submit");
assert.equal(lobstrText.includes("signAndSubmitTransaction"), false, "LOBSTR extension module has no submit method");
assert.equal(
    /signTransaction\(xdr\)/.test(lobstrText),
    true,
    "LOBSTR extension signs the XDR without a network argument"
);
assert.equal(
    walletConnectText.includes('method: WalletConnectAllowedMethods.SIGN'),
    true,
    "WalletConnect sign method"
);
assert.equal(
    extensionText.includes('signType:r,type:t.SIGN'),
    true,
    "LOBSTR extension request type is SIGN"
);
assert.equal(
    walletHtml.includes("HAVKAR did not ask the wallet to sign."),
    true,
    "missing account stops before the signing message"
);

const signer = Keypair.random();
const destination = Keypair.random();
let signCalls = 0;
let signMode = "testnet";

globalThis.HAVKAR_STELLAR_TEST_SIGN = (prepared, network) => {
    signCalls += 1;
    const passphrase = signMode === "lobstr-own-network"
        ? Networks.PUBLIC
        : network.passphrase;
    const transaction = TransactionBuilder.fromXDR(prepared.xdr, passphrase);
    transaction.sign(signer);
    return { signedTxXdr: transaction.toXDR() };
};

function useAccount(keypair) {
    window.HAVKAR_STELLAR.connected = true;
    window.HAVKAR_STELLAR.address = keypair.publicKey();
    window.havkarSetStellarNetwork("TESTNET");
    window.location.hostname = "127.0.0.1";
}

useAccount(signer);
window.havkarSetStellarNetwork("PUBLIC");
const mainnet = window.havkarGetStellarNetwork();
assert.equal(mainnet.id, "PUBLIC", "mainnet id");
assert.equal(mainnet.paymentsEnabled, false, "mainnet payments disabled");
assert.equal(mainnet.horizon, "https://horizon.stellar.org", "mainnet horizon");
signMode = "selected-network";
await assert.rejects(
    () => window.havkarSignAndSubmitStellarPayment({
        destination: destination.publicKey(),
        amount: "1",
        memo: "mainnet-checked"
    }),
    /Mainnet payments are protected/
);
assert.equal(signCalls, 0, "mainnet made no signature request");
assert.equal(calls.submit, 0, "mainnet made no submit");

window.havkarSetStellarNetwork("TESTNET");
const missing = Keypair.random();
missingAccounts.add(missing.publicKey());
window.HAVKAR_STELLAR.address = missing.publicKey();
await assert.rejects(
    () => window.havkarSignAndSubmitStellarPayment({
        destination: destination.publicKey(),
        amount: "1",
        memo: "missing"
    }),
    /No Stellar account was found on Testnet/
);
assert.equal(signCalls, 0, "missing account made no signature request");
assert.equal(calls.submit, 0, "missing account made no submit");

useAccount(signer);
signMode = "lobstr-own-network";
await assert.rejects(
    () => window.havkarSignAndSubmitStellarPayment({
        destination: destination.publicKey(),
        amount: "1",
        memo: "wrong-net"
    }),
    /signature does not match/
);
assert.equal(signCalls, 1, "wrong network reached the signer once");
assert.equal(calls.submit, 0, "wrong network was not submitted");

signMode = "testnet";
await assert.rejects(
    () => window.havkarSignAndSubmitStellarPayment({
        destination: destination.publicKey(),
        amount: "1",
        memo: "checked"
    }),
    /mock submit blocked/
);
assert.equal(signCalls, 2, "matching signature was accepted");
assert.equal(calls.submit, 1, "matching signature reached the blocked submit");

console.log("LOBSTR_SIGN_GUARD_OK");
process.exit(0);
