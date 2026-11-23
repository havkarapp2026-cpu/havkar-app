import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { getWalletArchitecture } from "../lib/havkar-wallet-architecture.cjs";
import { buildStellarMetrics } from "../lib/havkar-stellar-metrics.cjs";

const require = createRequire(import.meta.url);
const flags = require("../havkar-wallet.js");

const arch = getWalletArchitecture();
assert.equal(arch.ok, true);
assert.equal(arch.architecture.signing.havkar_can_unilaterally_move_xlm, false);
assert.equal(arch.architecture.fiat_rails.deposits_enabled, false);
assert.match(arch.architecture.regulatory_notes.mica, /CASP/i);
assert.match(arch.architecture.regulatory_notes.psd2, /PI/i);

assert.equal(flags.FIAT_DEPOSITS_ENABLED, false);
assert.equal(flags.FIAT_WITHDRAWALS_ENABLED, false);
assert.equal(flags.FIAT_TRANSFERS_ENABLED, false);

const source = fs.readFileSync("stellar-wallet-source.js", "utf8");
assert.match(source, /havkarFetchStellarRecentPayments/);
assert.match(source, /window\.havkarFetchStellarRecentPayments/);
assert.doesNotMatch(source, /fromSecret\(/);

const bundle = fs.readFileSync("stellar-wallet-bundle.js", "utf8");
assert.match(bundle, /havkarFetchStellarRecentPayments/);

const wallet = fs.readFileSync("wallet.html", "utf8");
assert.match(wallet, /stellarNoncustodial/);
assert.match(wallet, /reviewHAVKARStellarPayment/);
assert.match(wallet, /confirmHAVKARStellarPayment/);
assert.match(wallet, /stellarReceiveQr/);
assert.match(wallet, /loadStellarHorizonHistory/);
assert.match(wallet, /wallet_architecture/);
assert.match(wallet, /HAVKAR finance hub/);
assert.match(wallet, /non-custodial/);

const finance = fs.readFileSync("lib/havkar-finance-api.cjs", "utf8");
assert.match(finance, /stellar_metrics/);
assert.match(finance, /wallet_architecture/);
assert.match(finance, /buildStellarMetrics/);

// Mock metrics aggregation without DB
const fakeDb = {
  from() {
    return {
      select() {
        return this;
      },
      order() {
        return this;
      },
      limit() {
        return this;
      },
      eq() {
        return this;
      },
      async then(resolve) {
        return resolve({
          data: [
            {
              id: 1,
              status: "settled",
              tx_hash: "abc",
              network: "PUBLIC",
              amount_xlm: "2.5",
              platform_fee_xlm: "0.1",
              payer_account: "GAAA",
              user_id: "u1",
              settled_at: "2026-11-01T00:00:00Z",
              created_at: "2026-11-01T00:00:00Z",
              settlement_model: "direct_split",
              flow: "marketplace"
            },
            {
              id: 2,
              status: "failed",
              tx_hash: null,
              network: "TESTNET",
              amount_xlm: "1",
              platform_fee_xlm: "0",
              payer_account: "GBBB",
              user_id: "u2",
              created_at: "2026-11-02T00:00:00Z"
            }
          ],
          error: null
        });
      }
    };
  }
};

// supabase-js style: await db.from().select()... returns promise-like; our builder uses await query
// Adapt: buildStellarMetrics expects thenable chain ending as await query
async function runMetrics() {
  const chain = {
    _eq: null,
    select() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    eq(col, val) {
      this._eq = { col, val };
      return this;
    },
    then(resolve, reject) {
      const rows = [
        {
          id: 1,
          status: "settled",
          tx_hash: "abc",
          network: "PUBLIC",
          amount_xlm: "2.5",
          platform_fee_xlm: "0.1",
          payer_account: "GAAA",
          user_id: "u1",
          settled_at: "2026-11-01T00:00:00Z",
          created_at: "2026-11-01T00:00:00Z",
          settlement_model: "direct_split",
          flow: "marketplace"
        },
        {
          id: 2,
          status: "failed",
          tx_hash: null,
          network: "TESTNET",
          amount_xlm: "1",
          platform_fee_xlm: "0",
          payer_account: "GBBB",
          user_id: "u2",
          created_at: "2026-11-02T00:00:00Z"
        }
      ];
      const filtered = this._eq
        ? rows.filter((r) => String(r[this._eq.col]).toUpperCase() === String(this._eq.val).toUpperCase())
        : rows;
      return Promise.resolve({ data: filtered, error: null }).then(resolve, reject);
    }
  };
  const db = {
    from() {
      return chain;
    }
  };
  const all = await buildStellarMetrics(db, {});
  assert.equal(all.ok, true);
  assert.equal(all.totals.settled_with_tx, 1);
  assert.equal(all.totals.unique_payer_accounts, 1);
  assert.equal(all.totals.volume_xlm, 2.5);
  assert.equal(all.money_moved_by_this_endpoint, false);
  const pub = await buildStellarMetrics(db, { network: "PUBLIC" });
  assert.equal(pub.totals.settled_with_tx, 1);
}

await runMetrics();
console.log("HAVKAR_WALLET_NONCUSTODIAL_FINAL_TEST_OK");
