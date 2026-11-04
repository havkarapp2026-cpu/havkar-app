import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(new URL("../stellar-testnet-review.html", import.meta.url), "utf8");

assert.match(page, /does not create a payment/);
assert.match(page, /authenticated HAVKAR session/);
assert.match(page, /Mainnet payments stay disabled/);
assert.match(page, /not the HAVKAR receiving wallet/);
assert.match(page, /HAVKAR_STELLAR_TESTNET_DESTINATION/);
assert.match(page, /kraken-xlmeur/);
assert.match(page, /c1e3ff9fa1d49dd768d1d35f3e427713dc1a66c5a92224b2689395dd24d14764/);
assert.match(page, /81327299ab0d3ef06c1d6650aa86bbb09dbc054aa6ab63dc0aeb259272a3133d/);
assert.equal(page.includes("sb_secret"), false);
assert.equal(page.includes("service_role"), false);
assert.equal(page.includes("horizon.stellar.org"), false);
assert.equal(/S[A-Z2-7]{55}/.test(page), false);

console.log("STELLAR_TESTNET_REVIEW_OK");
