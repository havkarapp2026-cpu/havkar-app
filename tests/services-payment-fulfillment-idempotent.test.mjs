/**
 * Services Stripe fulfillment: pre-inserted liability ledger must not block
 * booking completion; replay must stay idempotent (no double commission).
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serviceCommerce = require("../havkar-service-commerce.js");

function makeStore() {
  const bookings = new Map();
  const ledgers = new Map();
  const providers = new Map();
  return {
    bookings,
    ledgers,
    providers,
    from(table) {
      const self = this;
      if (table === "service_bookings") {
        return {
          _filters: {},
          _patch: null,
          select() {
            return this;
          },
          eq(col, val) {
            this._filters[col] = val;
            return this;
          },
          async maybeSingle() {
            if (this._patch) {
              const id = Number(this._filters.id);
              const row = Object.assign({}, bookings.get(id), this._patch);
              bookings.set(id, row);
              return { data: row, error: null };
            }
            const id = Number(this._filters.id);
            const row = bookings.get(id);
            if (!row) return { data: null, error: null };
            if (
              this._filters.customer_id &&
              String(row.customer_id) !== String(this._filters.customer_id)
            ) {
              return { data: null, error: null };
            }
            return { data: { ...row }, error: null };
          },
          update(patch) {
            this._patch = patch;
            return this;
          }
        };
      }
      if (table === "service_commission_entries") {
        return {
          _filters: {},
          _mode: "select",
          _payload: null,
          select() {
            return this;
          },
          eq(col, val) {
            this._filters[col] = val;
            return this;
          },
          async maybeSingle() {
            const id = Number(this._filters.booking_id);
            if (this._mode === "update") {
              const prev = ledgers.get(id) || { booking_id: id };
              const next = Object.assign({}, prev, this._payload);
              ledgers.set(id, next);
              return { data: next, error: null };
            }
            const row = ledgers.get(id);
            return { data: row ? { ...row } : null, error: null };
          },
          async insert(payload) {
            const id = Number(payload.booking_id);
            if (ledgers.has(id)) {
              return {
                data: null,
                error: { code: "23505", message: "duplicate key" },
                select() {
                  return this;
                },
                async maybeSingle() {
                  return {
                    data: null,
                    error: { code: "23505", message: "duplicate key" }
                  };
                }
              };
            }
            ledgers.set(id, { ...payload });
            return {
              data: [{ booking_id: id }],
              error: null,
              select() {
                return this;
              },
              async maybeSingle() {
                return { data: { booking_id: id }, error: null };
              }
            };
          },
          update(payload) {
            this._mode = "update";
            this._payload = payload;
            return this;
          }
        };
      }
      if (table === "service_provider_profiles") {
        return {
          _filters: {},
          select() {
            return this;
          },
          eq(col, val) {
            this._filters[col] = val;
            return this;
          },
          async maybeSingle() {
            const row = providers.get(String(this._filters.user_id));
            return { data: row ? { ...row } : null, error: null };
          }
        };
      }
      throw new Error("unexpected table " + table);
    }
  };
}

const providerId = "prov-1";
const customerId = "cust-1";
const connectAcct = "acct_test_services";

const store = makeStore();
store.providers.set(providerId, {
  user_id: providerId,
  stripe_account_id: connectAcct
});
store.bookings.set(3, {
  id: 3,
  customer_id: customerId,
  provider_id: providerId,
  agreed_price: 1,
  currency: "EUR",
  payment_method: "online",
  status: "pending",
  stripe_checkout_session_id: "cs_test_1",
  stripe_payment_intent: null,
  stripe_charge_id: null
});
/* Trigger-style liability row created at booking insert. */
store.ledgers.set(3, {
  booking_id: 3,
  agreed_amount_cents: 100,
  customer_charge_cents: 100,
  commission_bps: 1000,
  commission_cents: 0,
  provider_settlement_cents: 0,
  stripe_event_id: null,
  collection_state: "uncollected",
  liability_state: "recorded"
});

const session = {
  id: "cs_test_1",
  payment_status: "paid",
  amount_total: 100,
  currency: "eur",
  payment_intent: {
    id: "pi_test_1",
    latest_charge: "ch_test_1"
  },
  metadata: {
    booking_id: "3",
    customer_id: customerId,
    havkar_flow: "services"
  }
};

const first = await serviceCommerce.applyVerifiedServicePayment({
  supabase: store,
  event: { id: "evt_test_1" },
  session,
  verifiedApplicationFeeCents: 10,
  verifiedTransferDestination: connectAcct,
  verifiedChargeId: "ch_test_1"
});

assert.equal(first.ok, true);
assert.equal(first.activated, true);
assert.equal(first.booking_status, "accepted");
assert.equal(first.stripe_payment_intent, "pi_test_1");
assert.equal(first.stripe_charge_id, "ch_test_1");
assert.equal(first.additionalCommissionCents, 0);
assert.equal(store.bookings.get(3).status, "accepted");
assert.equal(store.bookings.get(3).stripe_payment_intent, "pi_test_1");
assert.equal(store.ledgers.get(3).collection_state, "collected_stripe");
assert.equal(store.ledgers.get(3).stripe_event_id, "evt_test_1");
assert.equal(store.ledgers.get(3).commission_cents, 10);
assert.equal(store.ledgers.get(3).provider_settlement_cents, 90);

const replay = await serviceCommerce.applyVerifiedServicePayment({
  supabase: store,
  event: { id: "evt_test_1" },
  session,
  verifiedApplicationFeeCents: 10,
  verifiedTransferDestination: connectAcct,
  verifiedChargeId: "ch_test_1"
});
assert.equal(replay.ok, true);
assert.equal(replay.duplicate, true);
assert.equal(replay.activated, true);
assert.equal(store.ledgers.size, 1);

/* Network recovery: booking paid on Stripe but still pending locally. */
store.bookings.set(7, {
  id: 7,
  customer_id: customerId,
  provider_id: providerId,
  agreed_price: 1,
  currency: "EUR",
  payment_method: "online",
  status: "pending",
  stripe_checkout_session_id: "cs_test_7",
  stripe_payment_intent: null,
  stripe_charge_id: null
});
store.ledgers.set(7, {
  booking_id: 7,
  agreed_amount_cents: 100,
  customer_charge_cents: 100,
  commission_bps: 1000,
  commission_cents: 10,
  provider_settlement_cents: 90,
  stripe_event_id: null,
  collection_state: "uncollected",
  liability_state: "recorded"
});
const recovered = await serviceCommerce.applyVerifiedServicePayment({
  supabase: store,
  event: { id: "evt_test_7" },
  session: {
    ...session,
    id: "cs_test_7",
    payment_intent: { id: "pi_test_7", latest_charge: "ch_test_7" },
    metadata: { booking_id: "7", customer_id: customerId, havkar_flow: "services" }
  },
  verifiedApplicationFeeCents: 10,
  verifiedTransferDestination: connectAcct,
  verifiedChargeId: "ch_test_7"
});
assert.equal(recovered.ok, true);
assert.equal(store.bookings.get(7).status, "accepted");
assert.equal(store.ledgers.get(7).stripe_event_id, "evt_test_7");
assert.equal(store.ledgers.size, 2);

console.log("services-payment-fulfillment-idempotent.test.mjs: OK");
