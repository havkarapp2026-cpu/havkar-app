import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert.equal(pkg.dependencies["@stellar/stellar-sdk"], "17.4.0");

const sdkPkg = JSON.parse(
  fs.readFileSync("node_modules/@stellar/stellar-sdk/package.json", "utf8")
);
assert.equal(sdkPkg.version, "17.4.0");

const { StrKey, Horizon } = require("@stellar/stellar-sdk");
assert.equal(typeof StrKey.isValidMuxedContract, "function");
assert.equal(typeof StrKey.encodeMuxedContract, "function");

const source = fs.readFileSync("stellar-wallet-source.js", "utf8");
assert.match(source, /havkarFetchStellarProtocolInfo/);
assert.match(source, /requireClassicPaymentDestination/);
assert.match(source, /CAP-84/);
assert.match(source, /isValidMuxedContract/);
assert.doesNotMatch(source, /fromSecret\(/);

const bundle = fs.readFileSync("stellar-wallet-bundle.js", "utf8");
assert.match(bundle, /havkarFetchStellarProtocolInfo/);
assert.match(bundle, /isValidMuxedContract/);

// Live Mainnet protocol evidence (read-only)
const server = new Horizon.Server("https://horizon.stellar.org", {
  allowHttp: false
});
const page = await server.ledgers().order("desc").limit(1).call();
const ledger = page.records[0];
assert.ok(Number(ledger.protocol_version) >= 30, "Mainnet must be on Protocol 30+");
assert.ok(Number(ledger.sequence) > 0);

console.log(
  "HAVKAR_STELLAR_PROTOCOL30_TEST_OK",
  "protocol",
  ledger.protocol_version,
  "ledger",
  ledger.sequence
);
