const assert = require("assert");
const fs = require("fs");
const path = require("path");
const wallet = require("../havkar-wallet.js");

const walletPage = fs.readFileSync(path.join(__dirname, "../wallet.html"), "utf8");
const historyPage = fs.readFileSync(path.join(__dirname, "../history.html"), "utf8");
const migration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20261009070000_wallet_fiat_execution_disabled.sql"),
  "utf8"
);

assert.strictEqual(wallet.FIAT_TRANSFERS_ENABLED, false);
assert.strictEqual(wallet.FIAT_DEPOSITS_ENABLED, false);
assert.strictEqual(wallet.FIAT_WITHDRAWALS_ENABLED, false);
assert.strictEqual(wallet.FIAT_EXCHANGE_ENABLED, false);
assert.strictEqual(wallet.isValidIban("GB82WEST12345698765432"), true);
assert.strictEqual(wallet.isValidIban("GB82 WEST 1234 5698 7654 32"), true);
assert.strictEqual(wallet.isValidIban("GB82WEST12345698765433"), false);
assert.strictEqual(wallet.isValidIban("not-an-iban"), false);
assert.strictEqual(wallet.maskIban("GB82WEST12345698765432"), "GB…5432");
assert.ok(!wallet.maskIban("GB82WEST12345698765432").includes("WEST"));

assert.strictEqual(wallet.parseMoney("10.25").amount, "10.25");
assert.strictEqual(wallet.parseMoney("10").amount, "10.00");
assert.strictEqual(wallet.parseMoney("10.259").ok, false);
assert.strictEqual(wallet.parseMoney("-1.00").ok, false);
assert.strictEqual(wallet.parseMoney("0.00").ok, false);
assert.strictEqual(wallet.normalizeUserId("not-a-user").ok, false);
assert.strictEqual(
  wallet.normalizeUserId("11111111-1111-4111-8111-111111111111").ok,
  true
);

const fresh = wallet.assessFrankfurterQuote(
  { base: "EUR", date: "2026-10-08", rates: { USD: 1.16 } },
  1000,
  2000
);
assert.strictEqual(fresh.ok, true);
assert.strictEqual(fresh.fresh, true);
assert.strictEqual(fresh.executable, false);
assert.strictEqual(fresh.feeAmount, null);

const stale = wallet.assessFrankfurterQuote(
  { base: "EUR", date: "2026-10-08", rates: { USD: 1.16 } },
  1000,
  70001
);
assert.strictEqual(stale.fresh, false);
assert.strictEqual(
  wallet.assessFrankfurterQuote({ base: "USD", rates: { EUR: 1 } }, 1, 2).ok,
  false
);
assert.strictEqual(wallet.estimateConversion("10.00", 1.16).estimate, "11.60");

const entries = wallet.sortLedger([
  wallet.fromTransfer({
    id: "transfer-1",
    sender_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    receiver_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    amount: "5.00",
    currency: "EUR",
    created_at: "2026-10-01T00:00:00Z"
  }, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
  wallet.fromTransaction({
    id: "ledger-1",
    type: "refund",
    amount: "2.00",
    currency: "EUR",
    created_at: "2026-10-02T00:00:00Z",
    description: "Stored refund"
  }),
  wallet.fromOperation({
    id: "request-1",
    operation: "withdrawal",
    status: "not_submitted",
    amount: "8.00",
    currency: "EUR",
    reference: "HVW-TEST",
    reason: "licensed_payout_provider_required",
    iban_masked: "GB…5432",
    created_at: "2026-10-03T00:00:00Z"
  })
]);

assert.strictEqual(entries[0].reference, "HVW-TEST");
assert.strictEqual(entries[0].status, "Not submitted");
assert.strictEqual(wallet.filterLedger(entries, { type: "refund" }).length, 1);
assert.strictEqual(wallet.filterLedger(entries, { type: "withdrawal" }).length, 1);
assert.strictEqual(wallet.filterLedger(entries, { search: "HVW-TEST" }).length, 1);
assert.strictEqual(wallet.pageLedger(entries, 99).page, 0);

assert.ok(walletPage.includes("/havkar-wallet.js"));
assert.ok(walletPage.includes("Available EUR"));
assert.ok(walletPage.includes("request_internal_transfer"));
assert.ok(walletPage.includes("request_withdrawal"));
assert.ok(walletPage.includes("/api/eur-usd-quote"));
assert.ok(walletPage.includes('id="exchangeQuoteButton"'));
assert.ok(walletPage.includes("Loading the current EUR/USD quotation..."));
assert.ok(walletPage.includes("Frankfurter reference rate:"));
assert.ok(!walletPage.includes("ECB rate via Frankfurter"));
assert.ok(!walletPage.includes("api.frankfurter"));
const quoteSource = fs.readFileSync(path.join(__dirname, "../api/eur-usd-quote.js"), "utf8");
assert.ok(quoteSource.includes("https://api.frankfurter.dev/v2/rate/EUR/USD"));
assert.ok(!quoteSource.includes("api.frankfurter.app"));
assert.ok(!/1\.1\d{3}/.test(quoteSource));
assert.ok(!/api[_-]?key|secret|authorization/i.test(quoteSource));
assert.ok(walletPage.includes("Adding money is coming soon") || walletPage.includes("FIAT_DEPOSIT_UNAVAILABLE"));
assert.ok(!walletPage.includes("transfer_money"));
assert.ok(!walletPage.includes("Money sent successfully."));
assert.ok(!walletPage.includes("wallet_exchanges"));
assert.ok(!walletPage.includes("/api/create-event-checkout"));
assert.ok(!walletPage.includes("/api/create-job-checkout"));
assert.ok(walletPage.includes('id="exchangeExecute" type="button" disabled'));
assert.ok(historyPage.includes("wallet_transactions"));
assert.ok(historyPage.includes("wallet_transfers"));
assert.ok(historyPage.includes(".eq(\"user_id\",currentUser.id)"));
assert.ok(historyPage.includes("sender_id.eq."));
assert.ok(historyPage.includes("historySearch"));
assert.ok(historyPage.includes("No recorded transactions"));
assert.ok(historyPage.includes('window.location.replace("login.html")'));
assert.ok(!historyPage.includes("Auth session missing"));
assert.ok(!historyPage.includes("Please sign in"));

assert.ok(migration.includes("FIAT_TRANSFERS_DISABLED"));
assert.ok(migration.includes("fiat_execution_disabled"));
assert.ok(migration.includes("licensed_payout_provider_required"));
assert.ok(migration.includes("No euro balance was moved."));
assert.ok(migration.includes("no balance was reduced"));
assert.ok(!/balance\s*=\s*balance/i.test(migration));
assert.ok(!/UPDATE\s+public\.wallets/i.test(migration));
assert.ok(migration.includes('DROP POLICY IF EXISTS "Users can create their own exchanges"'));
assert.ok(migration.includes('DROP POLICY IF EXISTS "Users can update their own exchanges"'));

(async function verifyLiveQuote() {
  const quote = await import("../api/eur-usd-quote.js");
  let status = 0;
  let body = null;
  const response = {
    setHeader() {
      return this;
    },
    status(code) {
      status = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    }
  };

  await quote.default({ method: "GET" }, response);
  assert.strictEqual(status, 200);
  assert.strictEqual(body.base, "EUR");
  assert.ok(body.rates.USD > 0);
  const assessed = wallet.assessFrankfurterQuote(
    body,
    Date.parse(body.quoted_at),
    Date.now()
  );
  assert.strictEqual(assessed.ok, true);
  assert.strictEqual(assessed.fresh, true);
  assert.strictEqual(assessed.executable, false);
  console.log("WALLET_LEDGER_TEST_OK");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
