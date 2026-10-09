const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "../stellar-wallet-source.js"), "utf8");
const page = fs.readFileSync(path.join(__dirname, "../wallet.html"), "utf8");
const sdk = require("@stellar/stellar-sdk");

(async function run() {
  const rules = await import("../stellar-payment-rules.js");

  assert.strictEqual(rules.DEFAULT_STELLAR_NETWORK, "PUBLIC");
  assert.strictEqual(rules.PUBLIC_HORIZON, "https://horizon.stellar.org");
  assert.strictEqual(rules.TESTNET_HORIZON, "https://horizon-testnet.stellar.org");
  assert.strictEqual(rules.PUBLIC_PASSPHRASE, sdk.Networks.PUBLIC);
  assert.strictEqual(rules.TESTNET_PASSPHRASE, sdk.Networks.TESTNET);
  assert.notStrictEqual(rules.PUBLIC_PASSPHRASE, rules.TESTNET_PASSPHRASE);
  assert.strictEqual(rules.PUBLIC_PASSPHRASE, "Public Global Stellar Network ; September 2015");
  assert.strictEqual(rules.TESTNET_PASSPHRASE, "Test SDF Network ; September 2015");

  assert.strictEqual(rules.parseXlmAmount("1").text, "1.0000000");
  assert.strictEqual(rules.parseXlmAmount("1.5").stroops, 15000000n);
  assert.throws(() => rules.parseXlmAmount("0"), /greater than zero/);
  assert.throws(() => rules.parseXlmAmount("1.12345678"), /7 decimal/);
  assert.strictEqual(rules.spendableStroops(100000000n, 20000000n, 100n), 79999900n);
  assert.strictEqual(rules.spendableStroops(100n, 200n, 100n), 0n);
  assert.strictEqual(rules.hasExplicitApproval({}), false);
  assert.strictEqual(rules.hasExplicitApproval({ approved: true }), true);

  const hash = "a".repeat(64);
  assert.strictEqual(
    rules.stellarExplorerTxUrl("PUBLIC", hash),
    "https://stellar.expert/explorer/public/tx/" + hash
  );
  assert.strictEqual(
    rules.stellarExplorerTxUrl("TESTNET", hash),
    "https://stellar.expert/explorer/testnet/tx/" + hash
  );
  assert.notStrictEqual(
    rules.stellarExplorerTxUrl("PUBLIC", hash),
    rules.stellarExplorerTxUrl("TESTNET", hash)
  );

  assert.ok(source.includes("return DEFAULT_STELLAR_NETWORK"));
  assert.ok(source.includes("hasExplicitApproval(options)"));
  assert.ok(source.includes("server.submitTransaction"));
  assert.ok(source.includes("assertSignedPayment"));
  assert.ok(!source.includes("Mainnet payments are protected"));
  assert.ok(!source.includes("secret seed"));
  assert.ok(!/localStorage\.setItem\(\s*[\"'][^\"']*secret/i.test(source));

  assert.ok(page.includes('<option value="PUBLIC" selected>Mainnet</option>'));
  assert.ok(page.includes("Review Mainnet payment"));
  assert.ok(page.includes("approved:true"));
  assert.ok(page.includes("Mainnet public address:"));
  assert.ok(page.includes("Testnet balance, not Mainnet funds."));
  assert.ok(!page.includes("Mainnet is protected"));
  assert.ok(!page.includes("transfer_money"));
  assert.ok(page.includes("FIAT_TRANSFERS_ENABLED !== false"));
  assert.ok(page.includes('id="exchangeExecute" type="button" disabled'));

  const mainnet = await fetch(rules.PUBLIC_HORIZON);
  const testnet = await fetch(rules.TESTNET_HORIZON);
  assert.strictEqual(mainnet.status, 200);
  assert.strictEqual(testnet.status, 200);
  const mainnetRoot = await mainnet.json();
  const testnetRoot = await testnet.json();
  assert.strictEqual(mainnetRoot.network_passphrase, rules.PUBLIC_PASSPHRASE);
  assert.strictEqual(testnetRoot.network_passphrase, rules.TESTNET_PASSPHRASE);

  console.log("STELLAR_MAINNET_TEST_OK");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
