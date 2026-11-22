import assert from "node:assert/strict";
import { Keypair, Networks, TransactionBuilder, Operation, Asset, Memo, Account } from "@stellar/stellar-sdk";
import {
  buildXlmQuote,
  evaluateStellarCheckout,
  verifyStellarSettlement,
  xlmFromEur
} from "../lib/stellar-checkout.cjs";

const destination = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const payer = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWHF";
const env = { HAVKAR_STELLAR_TESTNET_DESTINATION: destination };
const now = Math.floor(Date.now() / 1000);

function rateFetch() {
  return Promise.resolve({
    ok: true,
    json: async () => ({ stellar: { eur: 0.1, last_updated_at: now } })
  });
}

function fakeAdmin(seed) {
  const row = { ...seed };

  return {
    from() {
      const state = { filters: {}, patch: null };

      const api = {
        select() { return api; },
        eq(field, value) {
          state.filters[field] = value;
          return api;
        },
        neq() { return api; },
        update(patch) {
          state.patch = patch;
          return api;
        },
        maybeSingle: async () => {
          if (state.filters.tx_hash && state.filters.tx_hash !== row.tx_hash) {
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

const decision = evaluateStellarCheckout({
  flow: "marketplace",
  price: 50,
  idempotency_key: "listing-123456"
});
const missing = await buildXlmQuote(decision, { env: {}, fetchImpl: rateFetch });
assert.equal(missing.code, "DESTINATION_NOT_CONFIGURED");
assert.equal(missing.paid, false);
assert.equal(missing.destination, undefined);

const collectEnv = {
  ...env,
  HAVKAR_XLM_ALLOW_PLATFORM_COLLECT: "true"
};
const quoted = await buildXlmQuote(decision, {
  env: collectEnv,
  fetchImpl: rateFetch,
  nowMs: Date.now(),
  memoBytes: Buffer.from("1234567890")
});
assert.equal(quoted.payable, true);
assert.equal(quoted.paid, false);
assert.equal(quoted.order_paid, false);
assert.equal(quoted.destination, destination);
assert.equal(quoted.settlement_model, "platform_collect");
assert.equal(quoted.amount_xlm, xlmFromEur(51, 0.1));
assert.equal(quoted.amount_xlm, "510.0000000");
assert.notEqual(quoted.amount_xlm, xlmFromEur(51 + 0.00001, 0.1));
assert.equal(quoted.memo.length <= 28, true);

const intent = {
  id: "intent-1",
  user_id: "user-1",
  status: "unpaid",
  expires_at: new Date(Date.now() + 60000).toISOString(),
  destination: destination,
  memo: quoted.memo,
  amount_xlm: quoted.amount_xlm,
  settlement_model: "platform_collect",
  tx_hash: null,
  payer_account: null
};
const hash = "a".repeat(64);

function horizon(successful, payments, memo) {
  return async (url) => {
    if (String(url).includes("/payments")) {
      return { ok: true, json: async () => ({ _embedded: { records: payments } }) };
    }

    return {
      ok: true,
      json: async () => ({
        successful: successful,
        memo_type: "text",
        memo: memo
      })
    };
  };
}

const payment = {
  type: "payment",
  asset_type: "native",
  to: destination,
  from: payer,
  amount: quoted.amount_xlm
};
const admin = fakeAdmin(intent);
const mismatch = await verifyStellarSettlement(admin, "user-1", {
  intent_id: "intent-1",
  tx_hash: hash
}, {
  env: collectEnv,
  fetchImpl: horizon(true, [{ ...payment, amount: "1.0000000" }], quoted.memo)
});
assert.equal(mismatch.code, "PAYMENT_MISMATCH");
assert.equal(mismatch.order_paid, false);

const settled = await verifyStellarSettlement(admin, "user-1", {
  intent_id: "intent-1",
  tx_hash: hash
}, {
  env: collectEnv,
  fetchImpl: horizon(true, [payment], quoted.memo)
});
assert.equal(settled.order_paid, true);
assert.equal(settled.settlement, "settled");

const replay = await verifyStellarSettlement(admin, "user-1", {
  intent_id: "intent-1",
  tx_hash: "b".repeat(64)
}, {
  env: collectEnv,
  fetchImpl: horizon(true, [payment], quoted.memo)
});
assert.equal(replay.code, "TX_REPLAY");
assert.equal(replay.order_paid, false);

const source = Keypair.random();
const receiver = Keypair.random();
const friendbot = async (key) => {
  const response = await fetch("https://friendbot.stellar.org/?addr=" + encodeURIComponent(key));

  if (!response.ok) {
    throw new Error("friendbot " + response.status);
  }
};

await friendbot(source.publicKey());
await friendbot(receiver.publicKey());
const accountResponse = await fetch("https://horizon-testnet.stellar.org/accounts/" + source.publicKey());
const accountBody = await accountResponse.json();
const memo = "hvsettlereal01";
const transaction = new TransactionBuilder(
  new Account(source.publicKey(), accountBody.sequence),
  { fee: "100", networkPassphrase: Networks.TESTNET }
)
  .addOperation(Operation.payment({
    destination: receiver.publicKey(),
    asset: Asset.native(),
    amount: "1.2500000"
  }))
  .addMemo(Memo.text(memo))
  .setTimeout(60)
  .build();
transaction.sign(source);
const submitted = await fetch("https://horizon-testnet.stellar.org/transactions", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "tx=" + encodeURIComponent(transaction.toXDR())
});
const submittedBody = await submitted.json();
assert.equal(submitted.ok, true, JSON.stringify(submittedBody));

const liveIntent = {
  id: "intent-live",
  status: "unpaid",
  expires_at: new Date(Date.now() + 60000).toISOString(),
  destination: receiver.publicKey(),
  memo: memo,
  amount_xlm: "1.2500000",
  tx_hash: null
};
const liveEnv = {
  HAVKAR_STELLAR_TESTNET_DESTINATION: receiver.publicKey(),
  HAVKAR_XLM_ALLOW_PLATFORM_COLLECT: "true"
};
const live = await verifyStellarSettlement(fakeAdmin({
  ...liveIntent,
  settlement_model: "platform_collect"
}), "user-1", {
  intent_id: "intent-live",
  tx_hash: submittedBody.hash
}, { env: liveEnv });
assert.equal(live.order_paid, true);
assert.equal(live.settlement, "settled");

const wrong = await verifyStellarSettlement(fakeAdmin({
  ...liveIntent,
  id: "intent-wrong",
  amount_xlm: "9.0000000",
  status: "unpaid",
  tx_hash: null,
  settlement_model: "platform_collect"
}), "user-1", {
  intent_id: "intent-wrong",
  tx_hash: submittedBody.hash
}, { env: liveEnv });
assert.equal(wrong.order_paid, false);
assert.equal(wrong.code, "PAYMENT_MISMATCH");

console.log("STELLAR_SETTLEMENT_TEST_OK");
