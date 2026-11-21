/**
 * Real Stellar Testnet dual-payment E2E for direct_split.
 * Uses friendbot + Horizon Testnet. No Mainnet. No production gates.
 */
import assert from "node:assert/strict";
import {
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
  Memo,
  Account
} from "@stellar/stellar-sdk";
import {
  verifyStellarSettlement,
  MODEL_DIRECT_SPLIT
} from "../lib/stellar-checkout.cjs";
import fs from "node:fs";

const HORIZON = "https://horizon-testnet.stellar.org";
const evidence = {
  network: "testnet",
  horizon: HORIZON,
  buyer: null,
  merchant: null,
  platform: null,
  memo: null,
  merchant_amount_xlm: "3.0000000",
  platform_fee_xlm: "0.1500000",
  tx_hash: null,
  verified_order_paid: false
};

async function friendbot(publicKey) {
  const response = await fetch(
    "https://friendbot.stellar.org/?addr=" + encodeURIComponent(publicKey)
  );
  if (!response.ok) {
    throw new Error("friendbot " + response.status);
  }
}

async function loadAccount(publicKey) {
  const response = await fetch(HORIZON + "/accounts/" + publicKey);
  assert.equal(response.ok, true, "account load " + publicKey);
  return response.json();
}

function fakeAdmin(seed) {
  const row = { ...seed };
  return {
    from() {
      const state = { filters: {}, patch: null };
      const api = {
        select() {
          return api;
        },
        eq(field, value) {
          state.filters[field] = value;
          return api;
        },
        neq() {
          return api;
        },
        update(patch) {
          state.patch = patch;
          return api;
        },
        maybeSingle: async () => {
          if (state.filters.tx_hash) {
            return { data: null };
          }
          if (state.filters.id && state.filters.id !== row.id) {
            return { data: null };
          }
          return { data: { ...row } };
        },
        single: async () => {
          if (state.patch) {
            if (state.filters.status && row.status !== state.filters.status) {
              return { data: null, error: { message: "conflict" } };
            }
            Object.assign(row, state.patch);
          }
          return { data: { ...row }, error: null };
        }
      };
      return api;
    }
  };
}

const buyer = Keypair.random();
const merchant = Keypair.random();
const platform = Keypair.random();
evidence.buyer = buyer.publicKey();
evidence.merchant = merchant.publicKey();
evidence.platform = platform.publicKey();

await friendbot(buyer.publicKey());
await friendbot(merchant.publicKey());
await friendbot(platform.publicKey());

const buyerAccount = await loadAccount(buyer.publicKey());
const memo = "hvdsplit" + Date.now().toString(36).slice(-8);
evidence.memo = memo;

const transaction = new TransactionBuilder(
  new Account(buyer.publicKey(), buyerAccount.sequence),
  { fee: "200", networkPassphrase: Networks.TESTNET }
)
  .addOperation(
    Operation.payment({
      destination: merchant.publicKey(),
      asset: Asset.native(),
      amount: evidence.merchant_amount_xlm
    })
  )
  .addOperation(
    Operation.payment({
      destination: platform.publicKey(),
      asset: Asset.native(),
      amount: evidence.platform_fee_xlm
    })
  )
  .addMemo(Memo.text(memo))
  .setTimeout(120)
  .build();

transaction.sign(buyer);

const submitted = await fetch(HORIZON + "/transactions", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "tx=" + encodeURIComponent(transaction.toXDR())
});
const submittedBody = await submitted.json();
assert.equal(submitted.ok, true, JSON.stringify(submittedBody));
evidence.tx_hash = submittedBody.hash;

const ops = await fetch(
  HORIZON + "/transactions/" + submittedBody.hash + "/payments"
);
assert.equal(ops.ok, true);
const opsBody = await ops.json();
const records = opsBody._embedded.records.filter((r) => r.type === "payment");
assert.equal(records.length >= 2, true);

const merchantOp = records.find(
  (r) =>
    r.to === merchant.publicKey() && r.amount === evidence.merchant_amount_xlm
);
const feeOp = records.find(
  (r) =>
    r.to === platform.publicKey() && r.amount === evidence.platform_fee_xlm
);
assert.ok(merchantOp, "merchant received");
assert.ok(feeOp, "platform fee received");
assert.equal(merchantOp.from, buyer.publicKey());
assert.equal(feeOp.from, buyer.publicKey());

const intent = {
  id: "intent-direct-e2e",
  user_id: "user-e2e",
  status: "unpaid",
  expires_at: new Date(Date.now() + 120000).toISOString(),
  destination: merchant.publicKey(),
  memo,
  amount_xlm: "3.1500000",
  settlement_model: MODEL_DIRECT_SPLIT,
  merchant_destination: merchant.publicKey(),
  platform_destination: platform.publicKey(),
  merchant_amount_xlm: evidence.merchant_amount_xlm,
  platform_fee_xlm: evidence.platform_fee_xlm,
  tx_hash: null
};

const verified = await verifyStellarSettlement(
  fakeAdmin(intent),
  "user-e2e",
  { intent_id: "intent-direct-e2e", tx_hash: submittedBody.hash },
  { env: { HAVKAR_STELLAR_TESTNET_DESTINATION: platform.publicKey() } }
);

assert.equal(verified.order_paid, true);
assert.equal(verified.settlement, "settled");
assert.equal(verified.settlement_model, MODEL_DIRECT_SPLIT);
assert.equal(verified.payer_account, buyer.publicKey());
evidence.verified_order_paid = true;

// Wrong amount must fail
const wrong = await verifyStellarSettlement(
  fakeAdmin({
    ...intent,
    id: "intent-wrong",
    status: "unpaid",
    merchant_amount_xlm: "9.0000000",
    tx_hash: null
  }),
  "user-e2e",
  { intent_id: "intent-wrong", tx_hash: submittedBody.hash },
  { env: { HAVKAR_STELLAR_TESTNET_DESTINATION: platform.publicKey() } }
);
assert.equal(wrong.order_paid, false);
assert.equal(wrong.code, "PAYMENT_MISMATCH");

// Replay different hash on settled intent
const replay = await verifyStellarSettlement(
  fakeAdmin({
    ...intent,
    status: "settled",
    tx_hash: submittedBody.hash,
    payer_account: buyer.publicKey()
  }),
  "user-e2e",
  { intent_id: "intent-direct-e2e", tx_hash: "f".repeat(64) },
  { env: { HAVKAR_STELLAR_TESTNET_DESTINATION: platform.publicKey() } }
);
assert.equal(replay.code, "TX_REPLAY");

fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
fs.writeFileSync(
  "/opt/cursor/artifacts/direct-split-testnet-e2e.json",
  JSON.stringify(evidence, null, 2)
);

console.log("DIRECT_SPLIT_TESTNET_E2E_OK");
console.log(JSON.stringify(evidence));
