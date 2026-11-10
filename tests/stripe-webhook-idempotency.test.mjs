import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const {
  isStripeEventId,
  claimRowFromEvent,
  claimStripeWebhookEvent,
  isOwnerEur1Session,
  ownerEur1Response
} = require("../lib/stripe-webhook-idempotency.cjs");

assert.equal(isStripeEventId("evt_1Ua6E1ECWiUpELSPhjQiUCB0"), true);
assert.equal(isStripeEventId("pi_x"), false);

const event = {
  id: "evt_1Ua6E1ECWiUpELSPhjQiUCB0",
  type: "checkout.session.completed",
  livemode: true,
  data: {
    object: {
      id: "cs_live_test",
      payment_status: "paid",
      metadata: { havkar_owner_micro_test: "true" }
    }
  }
};

const row = claimRowFromEvent(event);
assert.equal(row.stripe_event_id, event.id);
assert.equal(row.object_id, "cs_live_test");
assert.equal(row.livemode, true);

assert.equal(isOwnerEur1Session(event.data.object), true);
assert.equal(isOwnerEur1Session({ metadata: {} }), false);

const ack = ownerEur1Response(event.data.object, { event_id: event.id });
assert.equal(ack.owner_micro_test, true);
assert.equal(ack.payment_status, "paid");
assert.equal(ack.event_id, event.id);

const inserts = [];
const fakeSupabase = {
  from(table) {
    assert.equal(table, "stripe_webhook_events");
    return {
      async insert(payload) {
        if (inserts.includes(payload.stripe_event_id)) {
          return { error: { code: "23505", message: "duplicate key" } };
        }
        inserts.push(payload.stripe_event_id);
        return { error: null };
      }
    };
  }
};

const first = await claimStripeWebhookEvent(fakeSupabase, event);
assert.deepEqual(first, { ok: true, duplicate: false, durable: true });
const second = await claimStripeWebhookEvent(fakeSupabase, event);
assert.deepEqual(second, { ok: true, duplicate: true, durable: true });

const missingTable = {
  from() {
    return {
      async insert() {
        return {
          error: {
            code: "42P01",
            message: 'relation "public.stripe_webhook_events" does not exist'
          }
        };
      }
    };
  }
};
const degraded = await claimStripeWebhookEvent(missingTable, event);
assert.equal(degraded.ok, true);
assert.equal(degraded.duplicate, false);
assert.equal(degraded.durable, false);
assert.equal(degraded.warning, "table_missing");

const webhook = fs.readFileSync("api/stripe-webhook.js", "utf8");
assert.match(webhook, /claimStripeWebhookEvent/);
assert.match(webhook, /isOwnerEur1Session/);
assert.match(webhook, /Signed webhook delivery must still verify and settle/);
assert.ok(
  webhook.indexOf("claimStripeWebhookEvent") <
    webhook.indexOf("checkout.session.completed")
);

console.log("STRIPE_WEBHOOK_IDEMPOTENCY_OK");
