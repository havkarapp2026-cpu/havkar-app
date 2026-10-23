import assert from "node:assert/strict";
import fs from "node:fs";
import {
  Keypair,
  Networks,
  TransactionBuilder
} from "@stellar/stellar-sdk";
import {
  APPROVED_RATE_PROVIDERS,
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
  STAGING_SUPABASE_URL,
  assertStagingPaymentDatabase,
  assertSignedXdr,
  canonicalXlm,
  isAcceptedStagingServiceRoleKey,
  normalizeEurAmount,
  quoteXlmFromEur,
  readApprovedRateProvider,
  readReceivingAccount,
  verifyHorizonPayment
} from "../lib/stellar-payment-core.js";

function unsignedJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

const localServiceKey = "sb_secret_local_test_only";

assert.equal(normalizeEurAmount("€12,50"), "12.50");
assert.equal(normalizeEurAmount("0"), null);
assert.equal(normalizeEurAmount("Free"), null);
assert.equal(quoteXlmFromEur("10.00", "0.2500000").amountXlm, "40.0000000");
assert.equal(quoteXlmFromEur("1.00", "0.3000000").amountXlm, "3.3333333");
assert.equal(quoteXlmFromEur("10.00", "0.2500000").amountStroops, "400000000");
assert.throws(() => quoteXlmFromEur("0.01", "1000000"), /too small/);

assert.throws(
  () => assertStagingPaymentDatabase({
    VERCEL_ENV: "production",
    HAVKAR_STAGING_SUPABASE_URL: STAGING_SUPABASE_URL,
    HAVKAR_STAGING_SERVICE_ROLE_KEY: localServiceKey
  }),
  /disabled on production/
);

assert.throws(
  () => assertStagingPaymentDatabase({
    VERCEL_ENV: "preview",
    HAVKAR_STAGING_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    HAVKAR_STAGING_SERVICE_ROLE_KEY: localServiceKey
  }),
  /not configured/
);

assert.throws(
  () => assertStagingPaymentDatabase({
    VERCEL_ENV: "preview",
    HAVKAR_STAGING_SUPABASE_URL: STAGING_SUPABASE_URL,
    HAVKAR_STAGING_SERVICE_ROLE_KEY: ""
  }),
  /not configured/
);

assert.equal(isAcceptedStagingServiceRoleKey("staging-service-role-test-value"), false);
assert.equal(isAcceptedStagingServiceRoleKey("sb_publishable_example"), false);
assert.equal(
  isAcceptedStagingServiceRoleKey(unsignedJwt({
    role: "anon",
    ref: STAGING_PROJECT_REF
  })),
  false
);
assert.equal(
  isAcceptedStagingServiceRoleKey(unsignedJwt({
    role: "service_role",
    ref: PRODUCTION_PROJECT_REF
  })),
  false
);
assert.equal(
  isAcceptedStagingServiceRoleKey(unsignedJwt({
    role: "service_role",
    ref: STAGING_PROJECT_REF
  })),
  true
);

const configured = assertStagingPaymentDatabase({
  VERCEL_ENV: "preview",
  HAVKAR_STAGING_SUPABASE_URL: STAGING_SUPABASE_URL,
  HAVKAR_STAGING_SERVICE_ROLE_KEY: localServiceKey
});
assert.equal(configured.url, STAGING_SUPABASE_URL);
assert.equal(APPROVED_RATE_PROVIDERS.size, 0);
assert.throws(
  () => readApprovedRateProvider({ HAVKAR_XLM_RATE_PROVIDER: "example-rate-provider" }),
  /not approved/
);
assert.throws(() => readReceivingAccount({}), /not approved/);

const source = Keypair.random();
const destination = Keypair.random();
const transaction = new TransactionBuilder(
  new (await import("@stellar/stellar-sdk")).Account(source.publicKey(), "100"),
  { fee: "100", networkPassphrase: Networks.TESTNET }
)
  .addOperation((await import("@stellar/stellar-sdk")).Operation.payment({
    destination: destination.publicKey(),
    asset: (await import("@stellar/stellar-sdk")).Asset.native(),
    amount: "1.5000000"
  }))
  .addMemo((await import("@stellar/stellar-sdk")).Memo.text("hk0123456789abcdef01234567"))
  .setTimeout(180)
  .build();
transaction.sign(source);
const prepared = {
  source: source.publicKey(),
  destination: destination.publicKey(),
  amount: "1.5000000",
  memo: "hk0123456789abcdef01234567",
  sequence: String(transaction.sequence),
  fee: String(transaction.fee),
  minTime: String(transaction.timeBounds.minTime),
  maxTime: String(transaction.timeBounds.maxTime),
  hash: Array.from(transaction.hash(), (value) => value.toString(16).padStart(2, "0")).join("")
};
assertSignedXdr(transaction.toXDR(), prepared);
assert.throws(
  () => assertSignedXdr(transaction.toXDR(), { ...prepared, amount: "2.0000000" }),
  /does not match/
);

assert.throws(
  () => verifyHorizonPayment({
    successful: true,
    hash: "a".repeat(64),
    source_account: source.publicKey(),
    memo_type: "text",
    memo: "hk0123456789abcdef01234567"
  }, [{
    type: "payment",
    asset_type: "native",
    from: source.publicKey(),
    to: destination.publicKey(),
    amount: "1.0000000"
  }], {
    hash: "a".repeat(64),
    source: source.publicKey(),
    destination: destination.publicKey(),
    amount: "1.5000000",
    memo: "hk0123456789abcdef01234567"
  }),
  /does not match the quoted amount/
);

const api = fs.readFileSync(new URL("../api/stellar-payment.js", import.meta.url), "utf8");
const core = fs.readFileSync(new URL("../lib/stellar-payment-core.js", import.meta.url), "utf8");
assert.equal(api.includes("process.env.SUPABASE_URL"), false);
assert.equal(api.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
assert.equal(core.includes("horizon.stellar.org"), false);
assert.equal(/G[A-Z2-7]{55}/.test(api), false);
assert.equal(/G[A-Z2-7]{55}/.test(core), false);
assert.equal(canonicalXlm("1.5"), "1.5000000");

const events = fs.readFileSync(new URL("../events.html", import.meta.url), "utf8");
assert.match(events, /\/api\/create-event-checkout/);
assert.match(events, /havkarOpenStellarCheckout/);
assert.match(events, /data-havkar-xlm-checkout="event_ticket"/);
assert.match(events, /\["free", "", "0", "0\.00", "0,00"\]/);
const wallet = fs.readFileSync(new URL("../wallet.html", import.meta.url), "utf8");
assert.equal(wallet.includes("havkarOpenStellarCheckout"), false);
const stripe = fs.readFileSync(new URL("../api/stripe-webhook.js", import.meta.url), "utf8");
assert.match(stripe, /new Stripe\(process\.env\.STRIPE_SECRET_KEY\)/);

console.log("STELLAR_PAYMENT_CORE_OK");
