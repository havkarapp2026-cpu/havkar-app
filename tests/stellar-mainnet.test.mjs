import assert from "node:assert/strict";
import {
  mainnetReady,
  mainnetCustomerLiveReady,
  readMainnetDestination,
  stellarMainnetPaymentsEnabled,
  stellarMainnetLiveCollectionEnabled
} from "../lib/stellar-mainnet.cjs";
import {
  buildXlmQuote,
  evaluateStellarCheckout,
  verifyStellarSettlement
} from "../lib/stellar-checkout.cjs";

assert.equal(stellarMainnetPaymentsEnabled({}), false);
assert.equal(
  stellarMainnetPaymentsEnabled({ HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true" }),
  true
);
assert.equal(stellarMainnetLiveCollectionEnabled({}), false);
assert.equal(
  stellarMainnetLiveCollectionEnabled({
    HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true",
    HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION: "true"
  }),
  true
);

const missingDest = readMainnetDestination({
  HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true"
});
assert.equal(missingDest.code, "MAINNET_DESTINATION_NOT_CONFIGURED");
assert.equal(mainnetReady({ HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true" }), false);

const destination = "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCWHM";
const readyEnv = {
  HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true",
  HAVKAR_STELLAR_MAINNET_DESTINATION: destination
};
assert.equal(mainnetReady(readyEnv), true);
assert.equal(mainnetCustomerLiveReady(readyEnv), false);

const liveEnv = {
  ...readyEnv,
  HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION: "true"
};
assert.equal(mainnetCustomerLiveReady(liveEnv), true);

const liveOff = evaluateStellarCheckout(
  {
    network: "mainnet",
    flow: "marketplace",
    price: 50,
    idempotency_key: "mainnet-123456"
  },
  new Date(),
  readyEnv
);
assert.equal(liveOff.code, "STELLAR_MAINNET_LIVE_COLLECTION_OFF");

const decision = evaluateStellarCheckout(
  {
    network: "mainnet",
    flow: "marketplace",
    price: 50,
    idempotency_key: "mainnet-123456"
  },
  new Date(),
  liveEnv
);
assert.equal(decision.ok, true);
assert.equal(decision.network, "mainnet");

const now = Math.floor(Date.now() / 1000);
const accountFetch = async (url) => {
  const href = String(url);
  if (href.includes("/accounts/")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: destination, balances: [{ asset_type: "native", balance: "1" }] })
    };
  }
  return {
    ok: true,
    json: async () => ({ stellar: { eur: 0.1, last_updated_at: now } })
  };
};

const collectBlocked = await buildXlmQuote(decision, {
  env: liveEnv,
  fetchImpl: accountFetch,
  nowMs: Date.now(),
  memoBytes: Buffer.from("mainnetmemo00")
});
assert.equal(collectBlocked.payable, false);
assert.equal(collectBlocked.code, "MERCHANT_RECEIVE_KEY_REQUIRED");

const collectEnv = {
  ...liveEnv,
  HAVKAR_XLM_ALLOW_PLATFORM_COLLECT: "true"
};
const quoted = await buildXlmQuote(decision, {
  env: collectEnv,
  fetchImpl: accountFetch,
  nowMs: Date.now(),
  memoBytes: Buffer.from("mainnetmemo01")
});
assert.equal(quoted.payable, true);
assert.equal(quoted.destination, destination);
assert.equal(quoted.settlement_model, "platform_collect");
assert.equal(quoted.horizon, "https://horizon.stellar.org");

const missingAccount = await buildXlmQuote(decision, {
  env: collectEnv,
  fetchImpl: async (url) => {
    if (String(url).includes("/accounts/")) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return {
      ok: true,
      json: async () => ({ stellar: { eur: 0.1, last_updated_at: now } })
    };
  },
  nowMs: Date.now(),
  memoBytes: Buffer.from("mainnetmemo02")
});
assert.equal(missingAccount.code, "MAINNET_DESTINATION_NOT_FOUND");
assert.equal(missingAccount.payable, false);

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

const hash = "c".repeat(64);
const intent = {
  id: "intent-mainnet",
  user_id: "user-1",
  status: "unpaid",
  expires_at: new Date(Date.now() + 60000).toISOString(),
  destination,
  memo: quoted.memo,
  amount_xlm: quoted.amount_xlm,
  settlement_model: "platform_collect",
  tx_hash: null,
  payer_account: null,
  network: "mainnet"
};

const settled = await verifyStellarSettlement(
  fakeAdmin(intent),
  "user-1",
  { intent_id: "intent-mainnet", tx_hash: hash },
  {
    env: collectEnv,
    fetchImpl: async (url) => {
      if (String(url).includes("/payments")) {
        return {
          ok: true,
          json: async () => ({
            _embedded: {
              records: [
                {
                  type: "payment",
                  asset_type: "native",
                  to: destination,
                  from: "GDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDWHM",
                  amount: quoted.amount_xlm
                }
              ]
            }
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          successful: true,
          memo_type: "text",
          memo: quoted.memo
        })
      };
    }
  }
);

assert.equal(settled.order_paid, true);
assert.equal(settled.network, "mainnet");
assert.equal(settled.settlement, "settled");

console.log("STELLAR_MAINNET_TEST_OK");
