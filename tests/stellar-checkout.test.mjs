import assert from "node:assert/strict";
import fs from "node:fs";
import {
  evaluateStellarCheckout,
  quoteFeesForFlow,
  quoteServiceFees
} from "../lib/stellar-checkout.cjs";

const checkout = fs.readFileSync("api/create-event-checkout.js", "utf8");
const trade = fs.readFileSync("api/trade-crypto.js", "utf8");
const wallet = fs.readFileSync("stellar-wallet-source.js", "utf8");

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

const servicesFees = quoteServiceFees(100);
assert.equal(servicesFees.buyerPays, 100);
assert.equal(servicesFees.providerCommissionBps, 1000);
assert.equal(servicesFees.providerCommission, 10);
assert.equal(servicesFees.sellerReceives, 90);

const servicesQuote = evaluateStellarCheckout({
  flow: "services",
  price: 100,
  idempotency_key: "service-123456"
});
assert.equal(servicesQuote.ok, true);
assert.equal(servicesQuote.fees.buyerPays, 100);
assert.equal(quoteFeesForFlow("marketplace", 50).buyerFee, 1);

const mainnetDisabled = evaluateStellarCheckout(
  {
    network: "mainnet",
    price: 10,
    idempotency_key: "listing-123456"
  },
  new Date(),
  {}
);
assert.equal(mainnetDisabled.status, 403);
assert.equal(mainnetDisabled.code, "STELLAR_MAINNET_DISABLED");
assert.equal(mainnetDisabled.paid, false);

const mainnetArmedButLiveOff = evaluateStellarCheckout(
  {
    network: "mainnet",
    flow: "marketplace",
    price: 50,
    idempotency_key: "listing-123456"
  },
  new Date(),
  { HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true" }
);
assert.equal(mainnetArmedButLiveOff.code, "STELLAR_MAINNET_LIVE_COLLECTION_OFF");
assert.equal(mainnetArmedButLiveOff.paid, false);

const mainnetArmed = evaluateStellarCheckout(
  {
    network: "mainnet",
    flow: "marketplace",
    price: 50,
    idempotency_key: "listing-123456"
  },
  new Date(),
  {
    HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true",
    HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION: "true"
  }
);
assert.equal(mainnetArmed.ok, true);
assert.equal(mainnetArmed.network, "mainnet");
assert.equal(mainnetArmed.horizon, "https://horizon.stellar.org");
assert.equal(mainnetArmed.fees.buyerPays, 51);

const unsupportedFlow = evaluateStellarCheckout({
  flow: "one_time",
  price: 10,
  idempotency_key: "listing-123456"
});
assert.equal(unsupportedFlow.code, "XLM_FLOW_UNSUPPORTED");

const aiFlow = evaluateStellarCheckout({
  flow: "ai",
  price: 10,
  idempotency_key: "listing-123456"
});
assert.equal(aiFlow.code, "XLM_RECURRING_UNSUPPORTED");

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

assert.match(checkout, /verifyStellarSettlement/);
assert.match(checkout, /buildXlmQuote/);
assert.match(checkout, /payment_method === "xlm"/);
assert.match(checkout, /saveUnpaidIntent/);
assert.match(checkout, /order_paid: false/);
assert.match(checkout, /stellar_mainnet/);
assert.match(wallet, /const STELLAR_MAINNET_PAYMENTS_ENABLED\s*=\s*true/);

const xlmBranch = checkout.slice(
  checkout.indexOf('payment_method === "xlm"'),
  checkout.indexOf("const eventId")
);
assert.doesNotMatch(xlmBranch, /payment_status/);
assert.match(trade, /Trade is currently unavailable/);

console.log("STELLAR_CHECKOUT_TEST_OK");
