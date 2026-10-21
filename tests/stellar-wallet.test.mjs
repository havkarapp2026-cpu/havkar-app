import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";

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
    href: "http://127.0.0.1/wallet.html"
};
globalThis.window = globalThis;
globalThis.open = () => null;
if (typeof globalThis.addEventListener !== "function") {
    globalThis.addEventListener = () => {};
    globalThis.removeEventListener = () => {};
    globalThis.dispatchEvent = () => true;
}

function element() {
    return {
        style: { setProperty() {} },
        dataset: {},
        textContent: "",
        setAttribute() {},
        appendChild() {},
        prepend() {},
        addEventListener() {},
        removeEventListener() {}
    };
}

globalThis.document = {
    title: "",
    documentElement: element(),
    head: element(),
    body: element(),
    addEventListener() {},
    removeEventListener() {},
    createElement: element,
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

await import("../stellar-wallet-source.js");

function canonical(value) {
    const text = String(value);
    const [whole, fraction = ""] = text.split(".");
    return `${whole}.${fraction.padEnd(7, "0").slice(0, 7)}`;
}

async function friendbot(publicKey) {
    const response = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(publicKey)}`);
    if (!response.ok) {
        throw new Error(`Friendbot HTTP ${response.status}`);
    }
    return response.json();
}

async function horizonTransaction(hash) {
    const response = await fetch(`https://horizon-testnet.stellar.org/transactions/${hash}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Horizon HTTP ${response.status}`);
    return response.json();
}

async function horizonAccount(publicKey) {
    const response = await fetch(`https://horizon-testnet.stellar.org/accounts/${publicKey}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Horizon account HTTP ${response.status}`);
    return response.json();
}

function nativeBalance(account) {
    const row = account.balances.find((item) => item.asset_type === "native");
    return canonical(row.balance);
}

let signer = null;
let signCalls = 0;
let signMode = "ok";
let lastSigned = null;

globalThis.HAVKAR_STELLAR_TEST_SIGN = (prepared, network) => {
    signCalls += 1;
    if (signMode === "mutate") {
        const other = TransactionBuilder.fromXDR(
            lastPreparedXdr,
            Networks.TESTNET
        );
        other.sign(signer);
        return { signedTxXdr: other.toXDR() };
    }
    const passphrase = signMode === "wrong-network"
        ? Networks.PUBLIC
        : network.passphrase;
    const transaction = TransactionBuilder.fromXDR(prepared.xdr, passphrase);
    transaction.sign(signer);
    const signedTxXdr = transaction.toXDR();
    lastSigned = { prepared, signedTxXdr };
    return { signedTxXdr };
};

let lastPreparedXdr = "";

function useAccount(keypair) {
    signer = keypair;
    window.HAVKAR_STELLAR.connected = true;
    window.HAVKAR_STELLAR.address = keypair.publicKey();
    window.havkarSetStellarNetwork("TESTNET");
    window.location.hostname = "127.0.0.1";
}

const source = Keypair.random();
const destination = Keypair.random();
const fresh = Keypair.random();

console.log(`SOURCE ${source.publicKey()}`);
console.log(`DESTINATION ${destination.publicKey()}`);
console.log(`FRESH ${fresh.publicKey()}`);
console.log("FUND_SOURCE");
await friendbot(source.publicKey());
console.log("FUND_DESTINATION");
await friendbot(destination.publicKey());

const sourceBefore = nativeBalance(await horizonAccount(source.publicKey()));
const destinationBefore = nativeBalance(await horizonAccount(destination.publicKey()));
assert.equal(await horizonAccount(fresh.publicKey()), null, "fresh account");

useAccount(source);
const network = window.havkarGetStellarNetwork();
assert.equal(network.id, "TESTNET");
assert.equal(network.horizon, "https://horizon-testnet.stellar.org");
assert.equal(network.paymentsEnabled, true);

window.havkarSetStellarNetwork("PUBLIC");
const mainnet = window.havkarGetStellarNetwork();
assert.equal(mainnet.id, "PUBLIC");
assert.equal(mainnet.horizon, "https://horizon.stellar.org");
assert.equal(mainnet.paymentsEnabled, false);
assert.equal(signCalls, 0, "switching to mainnet made no signature request");
window.havkarSetStellarNetwork("TESTNET");

await assert.rejects(
    () => window.havkarSignAndSubmitStellarPayment({
        destination: source.publicKey(),
        amount: "1"
    }),
    /different Stellar account/
);

await assert.rejects(
    () => window.havkarSignAndSubmitStellarPayment({
        destination: "not-a-key",
        amount: "1"
    }),
    /valid Stellar destination/
);

await assert.rejects(
    () => window.havkarSignAndSubmitStellarPayment({
        destination: destination.publicKey(),
        amount: "9000000"
    }),
    /not enough/
);
assert.equal(
    nativeBalance(await horizonAccount(destination.publicKey())),
    destinationBefore,
    "underfunded destination"
);

await assert.rejects(
    () => window.havkarSignAndSubmitStellarPayment({
        destination: fresh.publicKey(),
        amount: "0.5"
    }),
    /needs at least/
);
assert.equal(await horizonAccount(fresh.publicKey()), null, "small createAccount");

const changed = await window.havkarPrepareStellarPayment({
    destination: destination.publicKey(),
    amount: "2",
    memo: "changed"
});
lastPreparedXdr = changed.xdr;
signMode = "mutate";
await assert.rejects(
    () => window.havkarSignAndSubmitStellarPayment({
        destination: destination.publicKey(),
        amount: "1.5",
        memo: "havkar-audit"
    }),
    /does not match the payment you reviewed/
);
assert.equal(
    nativeBalance(await horizonAccount(destination.publicKey())),
    destinationBefore,
    "mutated payment"
);
signMode = "wrong-network";
await assert.rejects(
    () => window.havkarSignAndSubmitStellarPayment({
        destination: destination.publicKey(),
        amount: "1.25",
        memo: "wrong-net"
    }),
    /signature does not match/
);
assert.equal(
    nativeBalance(await horizonAccount(destination.publicKey())),
    destinationBefore,
    "wrong network"
);
signMode = "ok";

window.location.hostname = "havkar-app.vercel.app";
const signsBeforeHostGate = signCalls;
await assert.rejects(
    () => window.havkarSignAndSubmitStellarPayment({
        destination: destination.publicKey(),
        amount: "1.1",
        memo: "host-gate"
    }),
    /not available|did not return|did not approve/
);
assert.equal(signCalls, signsBeforeHostGate, "production host ignored the test signer");
assert.equal(
    nativeBalance(await horizonAccount(destination.publicKey())),
    destinationBefore,
    "host gate submitted nothing"
);
window.location.hostname = "127.0.0.1";

const signsBeforeSuccess = signCalls;
const first = window.havkarSignAndSubmitStellarPayment({
    destination: destination.publicKey(),
    amount: "1.5",
    memo: "havkar-audit"
});
await assert.rejects(
    () => window.havkarSignAndSubmitStellarPayment({
        destination: destination.publicKey(),
        amount: "1.5",
        memo: "havkar-audit"
    }),
    /already in progress/
);
const success = await first;
console.log(`SUCCESS_HASH ${success.hash}`);
assert.equal(success.successful, true);
assert.equal(success.network, "TESTNET");
assert.equal(success.amount, "1.5000000");
assert.equal(success.source, source.publicKey());
assert.equal(success.destination, destination.publicKey());
assert.equal(signCalls, signsBeforeSuccess + 1, "one signature");

const record = await horizonTransaction(success.hash);
assert.equal(record.successful, true);
assert.equal(record.source_account, source.publicKey());
assert.equal(record.memo, "havkar-audit");
const operations = await fetch(`https://horizon-testnet.stellar.org/transactions/${success.hash}/operations`).then((response) => response.json());
assert.equal(operations._embedded.records.length, 1);
assert.equal(operations._embedded.records[0].type, "payment");
assert.equal(operations._embedded.records[0].to, destination.publicKey());
assert.equal(canonical(operations._embedded.records[0].amount), "1.5000000");
assert.equal(operations._embedded.records[0].asset_type, "native");

const destinationAfter = nativeBalance(await horizonAccount(destination.publicKey()));
assert.equal(destinationAfter, canonical(Number(destinationBefore) + 1.5), "destination credit");

sessionStorage.setItem("havkar_stellar_pending_payment", JSON.stringify({
    network: lastSigned.prepared.network,
    source: lastSigned.prepared.source,
    destination: lastSigned.prepared.destination,
    amount: lastSigned.prepared.amount,
    memo: lastSigned.prepared.memo,
    kind: lastSigned.prepared.kind,
    hash: lastSigned.prepared.hash,
    signedXdr: lastSigned.signedTxXdr,
    fee: lastSigned.prepared.fee,
    sequence: lastSigned.prepared.sequence,
    timeBounds: lastSigned.prepared.timeBounds,
    maxTime: String(Math.floor(Date.now() / 1000) + 120)
}));
const signsBeforeReplay = signCalls;
const replay = await window.havkarSignAndSubmitStellarPayment({
    destination: destination.publicKey(),
    amount: "1.5",
    memo: "havkar-audit"
});
assert.equal(replay.hash, success.hash, "replay hash");
assert.equal(signCalls, signsBeforeReplay, "replay did not sign again");
assert.equal(
    nativeBalance(await horizonAccount(destination.publicKey())),
    destinationAfter,
    "replay did not pay again"
);

sessionStorage.setItem("havkar_stellar_pending_payment", JSON.stringify({
    network: "TESTNET",
    source: source.publicKey(),
    destination: fresh.publicKey(),
    amount: "3.0000000",
    memo: "other",
    kind: "payment",
    hash: "a".repeat(64),
    signedXdr: lastSigned.signedTxXdr,
    fee: "100",
    sequence: "1",
    timeBounds: { minTime: "0", maxTime: String(Math.floor(Date.now() / 1000) + 120) },
    maxTime: String(Math.floor(Date.now() / 1000) + 120)
}));
await assert.rejects(
    () => window.havkarSignAndSubmitStellarPayment({
        destination: destination.publicKey(),
        amount: "1",
        memo: "different"
    }),
    /still unresolved/
);
sessionStorage.removeItem("havkar_stellar_pending_payment");
assert.equal(
    nativeBalance(await horizonAccount(destination.publicKey())),
    destinationAfter,
    "blocked duplicate"
);

const created = await window.havkarSignAndSubmitStellarPayment({
    destination: fresh.publicKey(),
    amount: "2",
    memo: "havkar-create"
});
console.log(`CREATE_HASH ${created.hash}`);
assert.equal(created.successful, true);
const createdRecord = await horizonTransaction(created.hash);
assert.equal(createdRecord.successful, true);
const createdAccount = await horizonAccount(fresh.publicKey());
assert.equal(nativeBalance(createdAccount), "2.0000000");
const createdOperations = await fetch(`https://horizon-testnet.stellar.org/transactions/${created.hash}/operations`).then((response) => response.json());
assert.equal(createdOperations._embedded.records[0].type, "create_account");
assert.equal(createdOperations._embedded.records[0].account, fresh.publicKey());

const balance = await window.havkarFetchStellarBalance(source.publicKey());
assert.equal(balance.exists, true);
assert.equal(balance.network, "TESTNET");
assert.ok(/^\d+\.\d{7}$/.test(balance.balance), "displayed balance");
const sourceAfter = nativeBalance(await horizonAccount(source.publicKey()));
assert.equal(balance.balance, sourceAfter, "displayed balance matches Horizon");
assert.ok(Number(sourceAfter) < Number(sourceBefore), "source decreased");

console.log("STELLAR_WALLET_TEST_OK");
console.log(`SUCCESS_HASH ${success.hash}`);
console.log(`CREATE_HASH ${created.hash}`);
console.log(`SOURCE ${source.publicKey()}`);
console.log(`DESTINATION ${destination.publicKey()}`);
console.log(`FRESH ${fresh.publicKey()}`);
