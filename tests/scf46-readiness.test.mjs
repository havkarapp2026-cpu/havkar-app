import { readFileSync } from "node:fs";

const assert = {
    equal(actual, expected, label) {
        if (actual !== expected) {
            throw new Error(`${label}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
        }
    },
    ok(value, label) {
        if (!value) throw new Error(label || "expected a truthy value");
    }
};

const draft = readFileSync(new URL("../docs/scf/SCF46-APPLICATION-DRAFT.md", import.meta.url), "utf8");
const notes = readFileSync(new URL("../docs/scf/SCF46-READINESS.md", import.meta.url), "utf8");
const source = readFileSync(new URL("../stellar-wallet-source.js", import.meta.url), "utf8");
const delivery = readFileSync(new URL("../delivery.html", import.meta.url), "utf8");
const market = readFileSync(new URL("../market.html", import.meta.url), "utf8");

const hash = "31b7592078ec91730b417c920d8f63cf77613f49be1e5d60baf2dec7f2e9ce76";
assert.ok(draft.includes(hash), "draft cites the verified hash");
assert.ok(notes.includes(hash), "notes cite the verified hash");
assert.ok(draft.includes("NOT READY"), "draft stays not ready");
assert.ok(draft.includes("has not been submitted"), "draft is not a submission");
assert.ok(draft.includes("Implemented"), "implemented work is labeled");
assert.ok(draft.includes("Planned"), "planned work is labeled");
assert.ok(!/10,000 users|10000 users|verified users/i.test(draft), "no invented user count");
assert.equal(draft.includes("$150,000 cap is not requested"), true, "cap is not the request");
assert.ok(/STELLAR_MAINNET_PAYMENTS_ENABLED\s*=\s*true/.test(source), "mainnet flag unchanged");
assert.equal(delivery.includes("havkarSignAndSubmitStellarPayment"), false, "delivery does not send XLM");
assert.equal(market.includes("havkarSignAndSubmitStellarPayment"), false, "market does not send XLM");

const response = await fetch(`https://horizon.stellar.org/transactions/${hash}`);
assert.equal(response.status, 200, "horizon status");
const transaction = await response.json();
assert.equal(transaction.successful, true, "successful");
assert.equal(transaction.source_account, "GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM", "source");
const operations = await fetch(`https://horizon.stellar.org/transactions/${hash}/operations`);
assert.equal(operations.status, 200, "operations status");
const body = await operations.json();
const records = body._embedded.records;
assert.equal(records.length, 1, "one operation");
assert.equal(records[0].type, "payment", "payment");
assert.equal(records[0].asset_type, "native", "native");
assert.equal(records[0].amount, "1.0000000", "amount");
assert.equal(records[0].to, "GAPCPQKBQ2VKSSRXUFOCGNUYEJLT3FRPYBCJCN2SJZ2TPLGEMMCUJV4L", "destination");

console.log("SCF46_READINESS_TEST_OK");
