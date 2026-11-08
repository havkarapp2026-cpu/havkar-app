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
const ready = readFileSync(new URL("../docs/scf/SCF46-SUBMISSION-READY.md", import.meta.url), "utf8");
const interest = readFileSync(
  new URL("../docs/scf/SCF-CORRECTED-INTEREST-FORM-20261108.md", import.meta.url),
  "utf8"
);
const matrix = readFileSync(
  new URL("../docs/scf/SCF-ELIGIBILITY-MATRIX-20261108.md", import.meta.url),
  "utf8"
);
const source = readFileSync(new URL("../stellar-wallet-source.js", import.meta.url), "utf8");
const delivery = readFileSync(new URL("../delivery.html", import.meta.url), "utf8");
const market = readFileSync(new URL("../market.html", import.meta.url), "utf8");

const hash = "31b7592078ec91730b417c920d8f63cf77613f49be1e5d60baf2dec7f2e9ce76";
assert.ok(draft.includes(hash), "draft cites the verified hash");
assert.ok(notes.includes(hash), "notes cite the verified hash");
assert.ok(draft.includes("rejected") || draft.includes("Rejected"), "draft records rejection");
assert.ok(/no verified invitation/i.test(ready), "ready denies invite");
assert.ok(/rejected/i.test(ready), "ready records rejection");
assert.ok(interest.includes("rejected"), "interest form records rejection");
assert.ok(interest.includes("communityfund.stellar.org/awards"), "interest form has URL");
assert.ok(matrix.includes("NONE verified") || matrix.includes("no verified"), "matrix denies invite");
assert.ok(notes.includes("9 November 2026"), "deadline recorded");
assert.ok(!/10,000 users|10000 users|verified users/i.test(draft + ready + interest), "no invented user count");
assert.ok(/STELLAR_MAINNET_PAYMENTS_ENABLED\s*=\s*false/.test(source), "mainnet stays off in source");
assert.equal(delivery.includes("havkarSignAndSubmitStellarPayment"), false, "delivery does not send XLM");
assert.equal(market.includes("havkarSignAndSubmitStellarPayment"), false, "market does not send XLM");
assert.ok(interest.includes("HAVKAR DI JALILNIA AMIR"), "business name present");
assert.ok(interest.includes("54,000"), "budget intent present");

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
