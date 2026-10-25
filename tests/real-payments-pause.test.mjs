import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cardPaymentsAllowed,
  realPaymentsEnabled
} from "../lib/real-payments.cjs";
import {
  paidAiServicesEnabled,
  subscriptionCheckoutStatus
} from "../supabase/functions/havkar-ai-assistant/policy.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader() {
      return this;
    }
  };
}

assert.equal(realPaymentsEnabled({}), false);
assert.equal(realPaymentsEnabled({ HAVKAR_REAL_PAYMENTS_ENABLED: "false" }), false);
assert.equal(realPaymentsEnabled({ HAVKAR_REAL_PAYMENTS_ENABLED: "1" }), false);
assert.equal(realPaymentsEnabled({ HAVKAR_REAL_PAYMENTS_ENABLED: "true" }), true);

assert.equal(cardPaymentsAllowed({}), false);
assert.equal(cardPaymentsAllowed({
  HAVKAR_REAL_PAYMENTS_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_live_not_a_real_key"
}), false);
assert.equal(cardPaymentsAllowed({
  HAVKAR_REAL_PAYMENTS_ENABLED: "true",
  HAVKAR_STRIPE_LIVE_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_live_not_a_real_key"
}), true);
assert.equal(cardPaymentsAllowed({
  HAVKAR_REAL_PAYMENTS_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_test_not_a_real_key"
}), true);

const checkout = read("api/create-event-checkout.js");
const pauseAt = checkout.indexOf("if (!cardPaymentsAllowed())");
const stripeInsertAt = checkout.indexOf('payment_provider: "stripe"');
const sessionAt = checkout.indexOf("checkout.sessions.create");
assert.ok(pauseAt > 0);
assert.ok(pauseAt < stripeInsertAt);
assert.ok(pauseAt < sessionAt);
assert.match(checkout, /const stripe = new Stripe\(process\.env\.STRIPE_SECRET_KEY\);/);
assert.match(checkout, /allowedCheckoutOrigin/);
assert.doesNotMatch(checkout, /sk_live_/);

const webhookSource = read("api/stripe-webhook.js");
assert.match(webhookSource, /const stripe = new Stripe\(process\.env\.STRIPE_SECRET_KEY\);/);
assert.ok(webhookSource.indexOf("cardPaymentsAllowed()") < webhookSource.indexOf("checkout.session.completed"));

const stellar = read("api/stellar-payment.mjs");
const stellarCore = read("lib/stellar-payment-core.mjs");
assert.equal(stellar.includes("HAVKAR_REAL_PAYMENTS_ENABLED"), false);
assert.match(stellar, /network: "TESTNET"/);
assert.match(stellarCore, /Stellar payments are disabled on production/);
assert.match(read("stellar-wallet-source.js"), /STELLAR_MAINNET_PAYMENTS_ENABLED\s*=\s*false/);

const wallet = read("wallet.html");
const sendFn = wallet.slice(wallet.indexOf("async function sendMoney"));
const withdrawFn = wallet.slice(wallet.indexOf("async function reviewWithdrawal"));
const sendGate = sendFn.indexOf("FIAT_TRANSFERS_ENABLED !== true");
const sendRpc = sendFn.indexOf("request_internal_transfer");
const withdrawGate = withdrawFn.indexOf("FIAT_WITHDRAWALS_ENABLED !== true");
const withdrawRpc = withdrawFn.indexOf("request_withdrawal");
assert.ok(sendGate > 0 && sendGate < sendRpc);
assert.ok(withdrawGate > 0 && withdrawGate < withdrawRpc);
assert.match(read("havkar-wallet.js"), /FIAT_WITHDRAWALS_ENABLED = false/);
assert.match(read("havkar-wallet.js"), /FIAT_TRANSFERS_ENABLED = false/);

const events = read("events.html");
assert.match(events, /\/api\/create-event-checkout/);
assert.match(events, /Card payments are paused until the owner enables them\./);
assert.match(events, /Pay with XLM/);

assert.equal(paidAiServicesEnabled({}), false);
assert.equal(paidAiServicesEnabled({ HAVKAR_REAL_PAYMENTS_ENABLED: "true" }), true);
assert.equal(subscriptionCheckoutStatus({
  STRIPE_SECRET_KEY: "sk_test_not_a_real_key",
  STRIPE_AI_PLUS_PRICE_ID: "price_plus",
  STRIPE_AI_PRO_PRICE_ID: "price_pro",
  STRIPE_AI_BUSINESS_PRICE_ID: "price_business"
}).ok, false);
assert.match(read("supabase/functions/havkar-ai-assistant/index.ts"), /Paid image generation is paused/);

const apiFiles = fs.readdirSync(path.join(root, "api"))
  .filter((name) => name.endsWith(".js") || name.endsWith(".mjs"));
assert.equal(apiFiles.length, 11);

const previous = {
  real: process.env.HAVKAR_REAL_PAYMENTS_ENABLED,
  live: process.env.HAVKAR_STRIPE_LIVE_ENABLED,
  stripe: process.env.STRIPE_SECRET_KEY,
  supabase: process.env.SUPABASE_URL,
  role: process.env.SUPABASE_SERVICE_ROLE_KEY,
  trade: process.env.HAVKAR_TRADE_ENABLED,
  pi: process.env.HAVKAR_PI_PAYMENTS_ENABLED
};

process.env.STRIPE_SECRET_KEY = "sk_test_pause_not_a_real_key";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-not-real";
delete process.env.HAVKAR_REAL_PAYMENTS_ENABLED;
delete process.env.HAVKAR_STRIPE_LIVE_ENABLED;
delete process.env.HAVKAR_TRADE_ENABLED;
delete process.env.HAVKAR_PI_PAYMENTS_ENABLED;

try {
  const { default: webhook } = await import("../api/stripe-webhook.js");
  const paused = mockRes();
  await webhook({ method: "POST", headers: {} }, paused);
  assert.equal(paused.statusCode, 403);
  assert.equal(paused.body.code, "REAL_PAYMENTS_PAUSED");

  process.env.HAVKAR_REAL_PAYMENTS_ENABLED = "true";
  process.env.STRIPE_SECRET_KEY = "sk_live_pause_not_a_real_key";
  const livePaused = mockRes();
  await webhook({ method: "POST", headers: {} }, livePaused);
  assert.equal(livePaused.statusCode, 403);
  assert.equal(livePaused.body.code, "REAL_PAYMENTS_PAUSED");

  process.env.HAVKAR_STRIPE_LIVE_ENABLED = "true";
  const opened = mockRes();
  await webhook({ method: "POST", headers: {} }, opened);
  assert.equal(opened.statusCode, 400);
  assert.equal(opened.body.error, "Missing Stripe signature");

  const { default: trade } = await import("../api/trade-crypto.js");
  delete process.env.HAVKAR_REAL_PAYMENTS_ENABLED;
  process.env.HAVKAR_TRADE_ENABLED = "true";
  const tradePaused = mockRes();
  await trade({ method: "POST", headers: {}, body: {} }, tradePaused);
  assert.equal(tradePaused.statusCode, 403);
  assert.equal(tradePaused.body.error, "Trade is currently unavailable.");

  const { default: piA2u } = await import("../api/pi-a2u-testnet.js");
  process.env.HAVKAR_PI_PAYMENTS_ENABLED = "true";
  const piPaused = mockRes();
  await piA2u({ method: "POST", body: {} }, piPaused);
  assert.equal(piPaused.statusCode, 404);
  assert.deepEqual(piPaused.body, { error: "Not found" });
} finally {
  for (const [name, value] of [
    ["HAVKAR_REAL_PAYMENTS_ENABLED", previous.real],
    ["HAVKAR_STRIPE_LIVE_ENABLED", previous.live],
    ["STRIPE_SECRET_KEY", previous.stripe],
    ["SUPABASE_URL", previous.supabase],
    ["SUPABASE_SERVICE_ROLE_KEY", previous.role],
    ["HAVKAR_TRADE_ENABLED", previous.trade],
    ["HAVKAR_PI_PAYMENTS_ENABLED", previous.pi]
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

console.log("REAL_PAYMENTS_PAUSE_OK");
