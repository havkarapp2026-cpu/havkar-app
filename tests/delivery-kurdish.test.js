const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const page = fs.readFileSync(path.join(__dirname, "../delivery.html"), "utf8");
const scriptAt = page.indexOf('src="/havkar-delivery-kurdish.js"');
const dictionaryAt = page.indexOf("const dictionaries = ");
assert.ok(scriptAt > -1 && scriptAt < dictionaryAt);
assert.ok(page.includes("window.HAVKAR_DELIVERY_KURDISH"));
assert.ok(!page.includes('ckb:"fa"') && !page.includes("ckb:\"fa\""));
assert.ok(page.includes('["fa","ar","ckb"]'));

const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../havkar-delivery-kurdish.js"), "utf8"),
    sandbox
);
const packs = sandbox.HAVKAR_DELIVERY_KURDISH;
assert.ok(packs.ckb["Request Delivery"] !== "Request Delivery");
assert.ok(packs.kmr["Request Delivery"] !== "Request Delivery");
assert.notStrictEqual(packs.ckb["Request Delivery"], packs.kmr["Request Delivery"]);
assert.ok(packs.ckb["Please sign in before requesting a delivery."].length > 8);
assert.ok(packs.kmr["Delete Permanently"]);

const htmlStart = page.indexOf("<body");
const form = page.slice(htmlStart, dictionaryAt);
for (const label of ["Request Delivery", "Pickup Address *", "Active Deliveries", "Recent Deliveries", "Become a Driver"]) {
    assert.ok(form.includes(label), label);
    assert.ok(packs.ckb[label] && packs.kmr[label]);
}

console.log("DELIVERY_KURDISH_TEST_OK");
