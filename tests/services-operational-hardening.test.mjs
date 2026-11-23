/**
 * Services operational hardening: settlement audit upsert shape,
 * completion honesty, and slot-conflict messaging helpers.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serviceCommerce = require("../havkar-service-commerce.js");

const honestStored = serviceCommerce.providerCompletionResponse({
  ok: true,
  deliveredToCustomer: false
});
assert.equal(honestStored.code, "completion_code_stored");
assert.match(String(honestStored.error || ""), /stored|unavailable/i);
assert.equal(honestStored.deliveredToCustomer, false);

const honestNotified = serviceCommerce.providerCompletionResponse({
  ok: true,
  deliveredToCustomer: true
});
assert.equal(honestNotified.code, "completion_code_notified");
assert.match(String(honestNotified.error || ""), /notification|customer/i);

const store = {
  events: [],
  bookings: new Map([
    [
      3,
      {
        id: 3,
        customer_id: "cust",
        provider_id: "prov",
        agreed_price: 1,
        currency: "EUR",
        payment_method: "online",
        status: "accepted",
        stripe_checkout_session_id: "cs_test",
        stripe_payment_intent: "pi_test",
        stripe_charge_id: "ch_test"
      }
    ]
  ]),
  ledgers: new Map([
    [
      3,
      {
        booking_id: 3,
        agreed_amount_cents: 100,
        customer_charge_cents: 100,
        commission_bps: 1000,
        commission_cents: 10,
        provider_settlement_cents: 90,
        stripe_event_id: "evt_test",
        collection_state: "collected_stripe",
        liability_state: "owed"
      }
    ]
  ]),
  providers: new Map([["prov", { user_id: "prov", stripe_account_id: "acct_x" }]]),
  from(table) {
    const self = this;
    if (table === "service_bookings") {
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
          const row = self.bookings.get(Number(this._filters.id));
          return { data: row ? { ...row } : null, error: null };
        },
        update() {
          return this;
        }
      };
    }
    if (table === "service_commission_entries") {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: { ...self.ledgers.get(3) }, error: null };
        },
        update() {
          return this;
        }
      };
    }
    if (table === "service_provider_profiles") {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: { ...self.providers.get("prov") }, error: null };
        }
      };
    }
    if (table === "service_settlement_events") {
      return {
        async upsert(row) {
          const existing = self.events.find(
            (e) => e.stripe_event_id === row.stripe_event_id
          );
          if (existing) {
            Object.assign(existing, row);
          } else {
            self.events.push({ ...row });
          }
          return { data: row, error: null };
        }
      };
    }
    throw new Error("unexpected " + table);
  }
};

const replay = await serviceCommerce.applyVerifiedServicePayment({
  supabase: store,
  event: { id: "evt_test", type: "checkout.session.completed" },
  session: {
    id: "cs_test",
    payment_status: "paid",
    amount_total: 100,
    currency: "eur",
    payment_intent: { id: "pi_test", latest_charge: "ch_test" },
    metadata: { booking_id: "3", customer_id: "cust", havkar_flow: "services" }
  },
  verifiedApplicationFeeCents: 10,
  verifiedTransferDestination: "acct_x",
  verifiedChargeId: "ch_test"
});
assert.equal(replay.ok, true);
assert.equal(store.events.length, 1);
assert.equal(store.events[0].stripe_event_id, "evt_test");
assert.equal(store.events[0].outcome, "services_booking_payment_collected");

const replay2 = await serviceCommerce.applyVerifiedServicePayment({
  supabase: store,
  event: { id: "evt_test", type: "checkout.session.completed" },
  session: {
    id: "cs_test",
    payment_status: "paid",
    amount_total: 100,
    currency: "eur",
    payment_intent: { id: "pi_test", latest_charge: "ch_test" },
    metadata: { booking_id: "3", customer_id: "cust", havkar_flow: "services" }
  },
  verifiedApplicationFeeCents: 10,
  verifiedTransferDestination: "acct_x",
  verifiedChargeId: "ch_test"
});
assert.equal(replay2.ok, true);
assert.equal(store.events.length, 1);

console.log("services-operational-hardening.test.mjs: OK");
