import assert from "node:assert/strict";
import {
  evaluateStellarCheckout,
  verifyStellarSettlement
} from "../lib/stellar-checkout.cjs";
import {
  stellarMainnetLiveCollectionEnabled,
  stellarMainnetPaymentsEnabled
} from "../lib/stellar-mainnet.cjs";

const destination = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const otherDest = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWHF";
const payerAccount = "GCCC CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCWHF".replace(/\s/g, "");
const env = { HAVKAR_STELLAR_TESTNET_DESTINATION: destination };

function fakeAdmin(seed, extras) {
  const row = { ...seed };
  const otherByTx = (extras && extras.otherByTx) || null;

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
        neq(field, value) {
          state.filters["neq_" + field] = value;
          return api;
        },
        update(patch) {
          state.patch = patch;
          return api;
        },
        maybeSingle: async () => {
          if (state.filters.tx_hash) {
            if (
              otherByTx &&
              state.filters.tx_hash === otherByTx.tx_hash &&
              state.filters.neq_id
            ) {
              return { data: { id: otherByTx.id } };
            }
            return { data: null };
          }

          if (state.filters.id && state.filters.id !== row.id) {
            return { data: null };
          }

          if (state.filters.user_id && state.filters.user_id !== row.user_id) {
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

function horizon(opts) {
  const successful = opts.successful !== false;
  const memo = opts.memo;
  const payments = opts.payments || [];
  const status = opts.status || 200;

  return async (url) => {
    if (String(url).includes("/payments")) {
      return { ok: true, json: async () => ({ _embedded: { records: payments } }) };
    }

    if (status !== 200) {
      return { ok: false, status, json: async () => ({}) };
    }

    return {
      ok: true,
      json: async () => ({
        successful,
        memo_type: opts.memo_type || "text",
        memo
      })
    };
  };
}

const baseIntent = {
  id: "intent-attack",
  user_id: "user-1",
  status: "unpaid",
  expires_at: new Date(Date.now() + 120000).toISOString(),
  destination,
  memo: "attackmemo01",
  amount_xlm: "10.0000000",
  tx_hash: null,
  payer_account: null,
  network: "testnet"
};

const payment = {
  type: "payment",
  asset_type: "native",
  to: destination,
  from: payerAccount,
  amount: "10.0000000"
};

// Marketplace / services fee quotes
{
  const market = evaluateStellarCheckout({
    flow: "marketplace",
    price: 100,
    idempotency_key: "fees-market-100"
  });
  assert.equal(market.ok, true);
  assert.equal(market.fees.buyerFee, 2);
  assert.equal(market.fees.sellerFee, 3);
  assert.equal(market.fees.buyerPays, 102);

  const services = evaluateStellarCheckout({
    flow: "services",
    price: 100,
    idempotency_key: "fees-services-100"
  });
  assert.equal(services.ok, true);
  assert.equal(services.fees.providerCommission, 10);
  assert.equal(services.fees.sellerReceives, 90);
}

// Live collection stays OFF without explicit LIVE_COLLECTION=true
assert.equal(
  stellarMainnetLiveCollectionEnabled({
    HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true",
    HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION: "false"
  }),
  false
);
assert.equal(
  stellarMainnetLiveCollectionEnabled({
    HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true"
  }),
  false
);
assert.equal(
  stellarMainnetPaymentsEnabled({
    HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true"
  }),
  true
);

// Expired quote
{
  const expired = await verifyStellarSettlement(
    fakeAdmin({
      ...baseIntent,
      expires_at: new Date(Date.now() - 1000).toISOString()
    }),
    "user-1",
    { intent_id: "intent-attack", tx_hash: "a".repeat(64) },
    {
      env,
      fetchImpl: horizon({ successful: true, memo: "attackmemo01", payments: [payment] })
    }
  );
  assert.equal(expired.code, "QUOTE_EXPIRED");
  assert.equal(expired.order_paid, false);
}

// Wrong memo
{
  const wrongMemo = await verifyStellarSettlement(
    fakeAdmin({ ...baseIntent }),
    "user-1",
    { intent_id: "intent-attack", tx_hash: "b".repeat(64) },
    {
      env,
      fetchImpl: horizon({ successful: true, memo: "wrongmemo999", payments: [payment] })
    }
  );
  assert.equal(wrongMemo.code, "MEMO_MISMATCH");
  assert.equal(wrongMemo.order_paid, false);
}

// Destination mismatch vs configured env
{
  const destMismatch = await verifyStellarSettlement(
    fakeAdmin({ ...baseIntent, destination: otherDest }),
    "user-1",
    { intent_id: "intent-attack", tx_hash: "c".repeat(64) },
    {
      env,
      fetchImpl: horizon({ successful: true, memo: "attackmemo01", payments: [payment] })
    }
  );
  assert.equal(destMismatch.code, "DESTINATION_MISMATCH");
  assert.equal(destMismatch.order_paid, false);
}

// Wrong amount
{
  const amountMismatch = await verifyStellarSettlement(
    fakeAdmin({ ...baseIntent }),
    "user-1",
    { intent_id: "intent-attack", tx_hash: "d".repeat(64) },
    {
      env,
      fetchImpl: horizon({
        successful: true,
        memo: "attackmemo01",
        payments: [{ ...payment, amount: "1.0000000" }]
      })
    }
  );
  assert.equal(amountMismatch.code, "PAYMENT_MISMATCH");
  assert.equal(amountMismatch.order_paid, false);
}

// Failed / unsuccessful tx
{
  const failed = await verifyStellarSettlement(
    fakeAdmin({ ...baseIntent }),
    "user-1",
    { intent_id: "intent-attack", tx_hash: "e".repeat(64) },
    {
      env,
      fetchImpl: horizon({
        successful: false,
        memo: "attackmemo01",
        payments: [payment]
      })
    }
  );
  assert.equal(failed.code, "TX_NOT_SUCCESSFUL");
  assert.equal(failed.settlement, "failed");
  assert.equal(failed.order_paid, false);
}

// Cross-user intent isolation
{
  const otherUser = await verifyStellarSettlement(
    fakeAdmin({ ...baseIntent }),
    "user-2",
    { intent_id: "intent-attack", tx_hash: "f".repeat(64) },
    {
      env,
      fetchImpl: horizon({ successful: true, memo: "attackmemo01", payments: [payment] })
    }
  );
  assert.equal(otherUser.code, "INTENT_NOT_FOUND");
  assert.equal(otherUser.order_paid, false);
}

// Replay of tx already on another quote
{
  const replay = await verifyStellarSettlement(
    fakeAdmin(
      { ...baseIntent },
      { otherByTx: { id: "other-intent", tx_hash: "1".repeat(64) } }
    ),
    "user-1",
    { intent_id: "intent-attack", tx_hash: "1".repeat(64) },
    {
      env,
      fetchImpl: horizon({ successful: true, memo: "attackmemo01", payments: [payment] })
    }
  );
  assert.equal(replay.code, "TX_REPLAY");
  assert.equal(replay.order_paid, false);
}

// Race: concurrent settle when unpaid row already consumed
{
  const raceAdmin = {
    from() {
      const state = { filters: {}, mode: "select" };
      const api = {
        select() {
          state.mode = "select";
          return api;
        },
        eq(field, value) {
          state.filters[field] = value;
          return api;
        },
        neq() {
          return api;
        },
        update() {
          state.mode = "update";
          return api;
        },
        maybeSingle: async () => {
          if (state.filters.tx_hash) {
            return { data: null };
          }
          return { data: { ...baseIntent } };
        },
        single: async () => {
          if (state.mode === "update") {
            return { data: null, error: { message: "conflict" } };
          }
          return { data: { ...baseIntent }, error: null };
        }
      };
      return api;
    }
  };

  const race = await verifyStellarSettlement(
    raceAdmin,
    "user-1",
    { intent_id: "intent-attack", tx_hash: "2".repeat(64) },
    {
      env,
      fetchImpl: horizon({ successful: true, memo: "attackmemo01", payments: [payment] })
    }
  );
  assert.equal(race.code, "SETTLEMENT_NOT_RECORDED");
  assert.equal(race.order_paid, false);
}

// Refund before settle refused
{
  const refundEarly = await verifyStellarSettlement(
    fakeAdmin({ ...baseIntent, status: "unpaid" }),
    "user-1",
    { intent_id: "intent-attack", tx_hash: "3".repeat(64), action: "refund" },
    { env, fetchImpl: horizon({ successful: true, memo: "attackmemo01", payments: [] }) }
  );
  assert.equal(refundEarly.code, "REFUND_NOT_READY");
  assert.equal(refundEarly.order_paid, false);
}

// Unsupported recurring flow refused
{
  const refusedFlow = evaluateStellarCheckout({
    flow: "subscription",
    price: 10,
    idempotency_key: "attack-sub-1"
  });
  assert.equal(refusedFlow.paid, false);
}

console.log("XLM_ATTACK_VECTORS_TEST_OK");
