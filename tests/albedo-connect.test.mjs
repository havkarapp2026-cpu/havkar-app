import { register } from "node:module";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";

function assertEqual(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(`${label}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
    }
}

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

const opens = [];
function nativeOpen(url, target, features) {
    const popup = {
        closed: false,
        location: { href: String(url) },
        focus() {},
        close() { this.closed = true; },
        document: { title: "", body: { textContent: "" } }
    };
    opens.push({ url: String(url), target, features, popup });
    return popup;
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.location = { hostname: "127.0.0.1", href: "http://127.0.0.1/wallet.html" };
globalThis.window = globalThis;
globalThis.open = nativeOpen;
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
        return { currentNode: null, nextNode() { return null; } };
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

register("./freighter-esm-hook.mjs", import.meta.url);
await import("../stellar-wallet-source.js");

const confirm = window.open(
    "https://albedo.link/confirm",
    "auth.albedo.link",
    "height=600,width=480"
);
assertEqual(opens.length, 1, "one native open");
assertEqual(opens[0].url, "about:blank", "same-origin placeholder");
assertEqual(opens[0].target, "auth.albedo.link", "albedo window name");
assertEqual(confirm.location.href, "https://albedo.link/confirm", "confirm navigation");
assertEqual(confirm, opens[0].popup, "returned opener window");

const other = window.open("https://freighter.app", "_blank", "");
assertEqual(opens.length, 2, "second open");
assertEqual(opens[1].url, "https://freighter.app", "other wallets stay direct");
assertEqual(other.location.href, "https://freighter.app", "other window location");

StellarWalletsKit.authModal = async () => {
    throw { message: "The user closed the modal." };
};
let closedMessage = "";
try {
    await window.havkarConnectStellarWallet();
} catch (error) {
    closedMessage = error.message;
}
if (!/did not finish connecting/.test(closedMessage)) {
    throw new Error(`closed modal message: ${closedMessage}`);
}
if (/did not approve/.test(closedMessage)) {
    throw new Error("closed modal was reported as a rejected signature");
}

StellarWalletsKit.authModal = async () => {
    throw { message: "Action request was rejected by the user." };
};
let rejectedMessage = "";
try {
    await window.havkarConnectStellarWallet();
} catch (error) {
    rejectedMessage = error.message;
}
assertEqual(
    rejectedMessage,
    "The wallet did not approve this request.",
    "real rejection"
);

console.log("ALBEDO_CONNECT_TEST_OK");
process.exit(0);
