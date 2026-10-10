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

  const signStart = source.indexOf("async function havkarSignAndSubmitStellarPayment");
  const signEnd = source.indexOf("async function havkarConnectStellarWallet");
  const signBody = source.slice(signStart, signEnd);
  assert.ok(signStart > 0 && signEnd > signStart);
  assert.ok(!signBody.includes("havkarPrepareStellarPayment"));
  assert.ok(signBody.includes("rememberSignedSubmission"));
  assert.ok(signBody.includes("havkarResolveStellarSubmission"));
  assert.ok(signBody.includes("submitTransaction"));
  assert.ok(source.includes("applySubmissionLookup"));
  assert.ok(source.includes("selectNetworkFeeStroops"));
  assert.ok(source.includes("checkMemoRequired"));
  assert.ok(source.includes("accountDataRequiresMemo"));
  assert.ok(source.includes("function requestWalletSignature("));
  assert.ok(source.includes("StellarWalletsKit.signTransaction("));
  assert.ok(source.includes("networkPassphrase:"));
  assert.ok(source.includes("address:prepared.source"));
  assert.ok(source.includes("StellarWalletsKit.authModal()"));
  assert.ok(source.includes("authModal:{"));
  assert.ok(source.includes("showInstallLabel:true"));
  assert.ok(source.includes("hideUnsupportedWallets:false"));
  assert.ok(!source.includes("fromSecret"));
  assert.ok(!/console\.(log|debug|info|warn)\(/.test(source));

  const connectStart = source.indexOf("async function havkarConnectStellarWallet(");
  const connectEnd = source.indexOf("async function havkarDisconnectStellarWallet(");
  const connectBody = source.slice(connectStart, connectEnd);
  assert.ok(connectStart > 0 && connectEnd > connectStart);
  assert.ok(connectBody.includes("StellarWalletsKit.authModal()"));
  assert.ok(connectBody.includes("StellarWalletsKit.setNetwork("));
  assert.ok(!connectBody.includes("showInstallLabel"));
  assert.ok(!connectBody.includes("submitTransaction"));
  assert.ok(!connectBody.includes("signTransaction"));
  assert.ok(!connectBody.includes("about:blank"));
  assert.ok(!connectBody.includes("createAlbedoConnectOpen"));
  assert.ok(source.includes("isAndroidBrowser("));
  assert.ok(source.includes("productId !== \"albedo\""));
  assert.ok(source.includes("new HavkarAndroidAlbedoModule()"));
  assert.ok(source.includes("new AlbedoModule()"));
  assert.ok(!source.includes("createAlbedoNamedPopupOpen("));
  assert.ok(source.includes("ANDROID_ALBEDO_BLOCKED_MESSAGE"));
  assert.ok(source.includes("walletConnectModule()"));
  assert.ok(source.includes("!module.signClient"));
  assert.ok(!source.includes("dispatchHandshake"));
  assert.ok(!source.includes("mountAlbedoConfirmFrame("));
  assert.ok(!source.includes("sendBackup"));

  assert.ok(page.includes("Check original transaction"));
  assert.ok(page.includes("havkarStellarSubmissionPending"));
  assert.ok(page.includes("Sequence: "));
  assert.ok(page.includes("Maximum network fee:"));
  assert.ok(page.includes("No new payment will be created"));

  assert.strictEqual(rules.selectNetworkFeeStroops({
    last_ledger_base_fee: "100",
    fee_charged: { min: "100", mode: "100" }
  }), 100n);
  assert.strictEqual(rules.selectNetworkFeeStroops({
    last_ledger_base_fee: "100",
    fee_charged: { min: "120", mode: "180" }
  }), 180n);
  assert.throws(() => rules.selectNetworkFeeStroops({}), /network fee/);
  assert.strictEqual(rules.accountDataRequiresMemo({ "config.memo_required": "MQ==" }), true);
  assert.strictEqual(rules.accountDataRequiresMemo({}), false);

  function buildPayment(options) {
    const sourceKeys = options.source || sdk.Keypair.random();
    const destinationKeys = options.destination || sdk.Keypair.random();
    const account = new sdk.Account(sourceKeys.publicKey(), options.accountSequence || "100");
    const timebounds = options.timebounds || { minTime: 0, maxTime: 1900000000 };
    let builder = new sdk.TransactionBuilder(account, {
      fee: options.fee || "100",
      networkPassphrase: options.passphrase || sdk.Networks.PUBLIC,
      timebounds: options.timeout ? undefined : timebounds
    });
    const amount = options.amount || "1.0000000";
    if (options.kind === "createAccount") {
      builder = builder.addOperation(sdk.Operation.createAccount({
        destination: destinationKeys.publicKey(),
        startingBalance: amount
      }));
    } else {
      builder = builder.addOperation(sdk.Operation.payment({
        destination: destinationKeys.publicKey(),
        asset: options.asset || sdk.Asset.native(),
        amount: amount
      }));
    }
    if (options.secondOperation) {
      builder = builder.addOperation(sdk.Operation.payment({
        destination: destinationKeys.publicKey(),
        asset: sdk.Asset.native(),
        amount: "1.0000000"
      }));
    }
    if (options.memo) builder = builder.addMemo(sdk.Memo.text(options.memo));
    const tx = options.timeout ? builder.setTimeout(options.timeout).build() : builder.build();
    if (options.sign !== false) tx.sign(options.signer || sourceKeys);
    return { sourceKeys, destinationKeys, tx };
  }

  function reviewedFrom(built, extra) {
    return Object.assign({
      network: built.tx.networkPassphrase === sdk.Networks.PUBLIC ? "PUBLIC" : "TESTNET",
      passphrase: built.tx.networkPassphrase,
      source: built.sourceKeys.publicKey(),
      destination: built.destinationKeys.publicKey(),
      amount: "1.0000000",
      kind: "payment",
      memo: "",
      fee: built.tx.fee,
      sequence: built.tx.sequence,
      minTime: built.tx.timeBounds.minTime,
      maxTime: built.tx.timeBounds.maxTime,
      signers: [{ key: built.sourceKeys.publicKey(), weight: 1 }],
      medThreshold: 1
    }, extra || {});
  }

  const valid = buildPayment({});
  const accepted = rules.assertSignedPaymentMatches(valid.tx.toXDR(), reviewedFrom(valid));
  assert.match(accepted.hash, /^[a-f0-9]{64}$/);

  const same = {
    source: valid.sourceKeys,
    destination: valid.destinationKeys
  };
  const otherFee = buildPayment(Object.assign({ fee: "300" }, same));
  assert.throws(
    () => rules.assertSignedPaymentMatches(otherFee.tx.toXDR(), reviewedFrom(valid)),
    /fee does not match/
  );

  const otherSequence = buildPayment(Object.assign({ accountSequence: "400" }, same));
  assert.throws(
    () => rules.assertSignedPaymentMatches(otherSequence.tx.toXDR(), reviewedFrom(valid)),
    /sequence does not match/
  );

  const otherAmount = buildPayment(Object.assign({ amount: "2.0000000" }, same));
  assert.throws(
    () => rules.assertSignedPaymentMatches(otherAmount.tx.toXDR(), reviewedFrom(valid)),
    /does not match the payment you reviewed/
  );

  const otherMemo = buildPayment(Object.assign({ memo: "rent" }, same));
  assert.throws(
    () => rules.assertSignedPaymentMatches(otherMemo.tx.toXDR(), reviewedFrom(valid)),
    /memo does not match/
  );

  const otherTime = buildPayment(Object.assign({ timeout: 30 }, same));
  assert.throws(
    () => rules.assertSignedPaymentMatches(otherTime.tx.toXDR(), reviewedFrom(valid)),
    /time bounds do not match/
  );

  const extraOperation = buildPayment(Object.assign({ secondOperation: true, fee: "50" }, same));
  assert.throws(
    () => rules.assertSignedPaymentMatches(extraOperation.tx.toXDR(), reviewedFrom(valid)),
    /does not match the payment you reviewed/
  );

  const attacker = sdk.Keypair.random();
  const unauthorized = buildPayment(Object.assign({ signer: attacker }, same));
  assert.throws(
    () => rules.assertSignedPaymentMatches(unauthorized.tx.toXDR(), reviewedFrom(valid)),
    /not authorized by the source account/
  );

  const unsigned = buildPayment({ sign: false });
  assert.throws(
    () => rules.assertSignedPaymentMatches(unsigned.tx.toXDR(), reviewedFrom(unsigned)),
    /did not attach a signature/
  );

  const wrongNetwork = buildPayment(Object.assign({ passphrase: sdk.Networks.TESTNET }, same));
  assert.throws(
    () => rules.assertSignedPaymentMatches(wrongNetwork.tx.toXDR(), reviewedFrom(valid)),
    /not authorized by the source account/
  );

  const lowWeight = buildPayment({});
  assert.throws(
    () => rules.assertSignedPaymentMatches(lowWeight.tx.toXDR(), reviewedFrom(lowWeight, { medThreshold: 2 })),
    /not authorized by the source account/
  );

  const nonNative = buildPayment(Object.assign({
    asset: new sdk.Asset("USD", sdk.Keypair.random().publicKey())
  }, same));
  assert.throws(
    () => rules.assertSignedPaymentMatches(nonNative.tx.toXDR(), reviewedFrom(valid)),
    /does not match the payment you reviewed/
  );

  let state = rules.initialSubmissionState();
  state = rules.lockSubmission(state);
  const sourceKey = sdk.Keypair.random().publicKey();
  const record = {
    network: "PUBLIC",
    hash: "ab".repeat(32),
    sequence: "101",
    source: sourceKey,
    destination: sdk.Keypair.random().publicKey(),
    amount: "1.0000000",
    fee: "100",
    memo: "",
    minTime: "0",
    maxTime: "500",
    horizon: rules.PUBLIC_HORIZON,
    label: "Mainnet"
  };
  state = rules.rememberSignedSubmission(state, record);
  assert.throws(() => rules.lockSubmission(state), /will not create another transaction/);
  state = rules.applySubmitResult(state, { timeout: true, resultCode: "" });
  assert.strictEqual(state.outcome, "uncertain");
  assert.strictEqual(state.phase, "uncertain");
  assert.strictEqual(state.record.hash, record.hash);
  assert.strictEqual(state.record.sequence, record.sequence);
  assert.strictEqual(rules.submissionBlocksNewPayment(state), true);
  assert.strictEqual(rules.classifySubmitError({ timeout: true, resultCode: "tx_failed" }), "uncertain");
  assert.strictEqual(rules.classifySubmitError({ timeout: false, resultCode: "tx_bad_seq" }), "uncertain");
  assert.strictEqual(rules.classifySubmitError({ timeout: false, resultCode: "tx_failed" }), "rejected");

  const stillWaiting = rules.applySubmissionLookup(state, { timeout: true });
  assert.strictEqual(stillWaiting.outcome, "uncertain");
  assert.strictEqual(stillWaiting.record.hash, record.hash);
  assert.strictEqual(stillWaiting.record.sequence, record.sequence);

  const notIndexed = rules.applySubmissionLookup(state, {
    timeout: false,
    found: false,
    accountSequence: "100",
    now: 10
  });
  assert.strictEqual(notIndexed.outcome, "uncertain");
  assert.strictEqual(notIndexed.record.hash, record.hash);

  const sequenceMoved = rules.applySubmissionLookup(state, {
    timeout: false,
    found: false,
    accountSequence: "101",
    now: 900
  });
  assert.strictEqual(sequenceMoved.outcome, "uncertain");
  assert.strictEqual(sequenceMoved.record.hash, record.hash);

  const expired = rules.applySubmissionLookup(state, {
    timeout: false,
    found: false,
    accountSequence: "100",
    now: 900
  });
  assert.strictEqual(expired.outcome, "expired");
  assert.strictEqual(expired.phase, "idle");
  assert.strictEqual(expired.record, null);
  assert.strictEqual(rules.submissionBlocksNewPayment(expired), false);

  const confirmed = rules.applySubmissionLookup(state, {
    timeout: false,
    found: true,
    successful: true,
    hash: record.hash,
    source: record.source
  });
  assert.strictEqual(confirmed.outcome, "confirmed");
  assert.strictEqual(confirmed.hash, record.hash);
  assert.strictEqual(confirmed.phase, "idle");

  const superseded = rules.applySubmissionLookup(state, {
    timeout: false,
    found: false,
    consumedByOther: true
  });
  assert.strictEqual(superseded.outcome, "rejected");
  assert.strictEqual(superseded.phase, "idle");
  assert.strictEqual(rules.submissionBlocksNewPayment(superseded), false);

  const mainnet = await fetch(rules.PUBLIC_HORIZON);
  const testnet = await fetch(rules.TESTNET_HORIZON);
  assert.strictEqual(mainnet.status, 200);
  assert.strictEqual(testnet.status, 200);
  const mainnetRoot = await mainnet.json();
  const testnetRoot = await testnet.json();
  assert.strictEqual(mainnetRoot.network_passphrase, rules.PUBLIC_PASSPHRASE);
  assert.strictEqual(testnetRoot.network_passphrase, rules.TESTNET_PASSPHRASE);

  const mainnetFees = await fetch(rules.PUBLIC_HORIZON + "/fee_stats");
  const testnetFees = await fetch(rules.TESTNET_HORIZON + "/fee_stats");
  assert.strictEqual(mainnetFees.status, 200);
  assert.strictEqual(testnetFees.status, 200);
  const mainnetFee = rules.selectNetworkFeeStroops(await mainnetFees.json());
  const testnetFee = rules.selectNetworkFeeStroops(await testnetFees.json());
  assert.ok(mainnetFee >= 100n);
  assert.ok(testnetFee >= 100n);

  console.log("STELLAR_MAINNET_TEST_OK");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
