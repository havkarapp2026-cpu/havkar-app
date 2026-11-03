import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluateStellarCheckout } from "../lib/stellar-checkout.cjs";

const checkout = fs.readFileSync("api/create-event-checkout.js", "utf8");
const trade = fs.readFileSync("api/trade-crypto.js", "utf8");

const quote = evaluateStellarCheckout({
  payment_method: "xlm",
  flow: "marketplace",
  price: 50,
  idempotency_key: "listing-123456"
});

assert.equal(quote.ok, true);
assert.equal(quote.paid, false);
assert.equal(quote.order_paid, false);
assert.equal(quote.network, "testnet");
assert.equal(quote.horizon, "https://horizon-testnet.stellar.org");
assert.equal(quote.fees.buyerPays, 51);
assert.equal(quote.fees.sellerReceives, 48.5);
assert.equal(quote.network_fee_xlm, "0.00001");
assert.equal(quote.payable, false);
assert.equal(quote.destination, null);
assert.equal(quote.memo, "listing-123456");
assert.equal(quote.memo_type, "text");

const mainnet = evaluateStellarCheckout({
  network: "mainnet",
  price: 10,
  idempotency_key: "listing-123456"
});
assert.equal(mainnet.status, 403);
assert.equal(mainnet.code, "STELLAR_MAINNET_DISABLED");
assert.equal(mainnet.paid, false);

const subscription = evaluateStellarCheckout({
  flow: "subscription",
  price: 10,
  idempotency_key: "listing-123456"
});
assert.equal(subscription.code, "XLM_RECURRING_UNSUPPORTED");
assert.equal(subscription.paid, false);

const tradeFlow = evaluateStellarCheckout({
  flow: "trade",
  price: 10,
  idempotency_key: "listing-123456"
});
assert.equal(tradeFlow.code, "TRADE_UNCHANGED");

const verify = evaluateStellarCheckout({
  action: "verify",
  price: 10,
  idempotency_key: "listing-123456"
});
assert.equal(verify.code, "SETTLEMENT_RECORDING_DISABLED");
assert.equal(verify.order_paid, false);

assert.match(checkout, /payment_method === "xlm"/);
assert.match(checkout, /saveUnpaidIntent/);
assert.match(checkout, /order_paid: false/);
const xlmBranch = checkout.slice(checkout.indexOf('payment_method === "xlm"'), checkout.indexOf("const eventId"));
assert.doesNotMatch(xlmBranch, /payment_status/);
assert.match(trade, /Trade is currently unavailable/);

console.log("STELLAR_CHECKOUT_TEST_OK");
