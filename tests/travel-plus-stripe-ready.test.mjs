import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  TRAVEL_PLUS,
  travelPlusStatus,
  ownerPrerequisites,
  buildCheckoutSessionParams,
  buildPortalSessionParams,
  isTravelPlusEvent,
  applyVerifiedCheckoutSession,
  isEntitledStatus
} = require("../lib/havkar-travel-plus.cjs");

test("catalog: €4.99, 30-day trial, free tier preserved, paid exclusives listed", () => {
  assert.equal(TRAVEL_PLUS.price_monthly, 4.99);
  assert.equal(TRAVEL_PLUS.price_cents, 499);
  assert.equal(TRAVEL_PLUS.trial_days, 30);
  assert.equal(TRAVEL_PLUS.currency, "EUR");
  assert.match(TRAVEL_PLUS.free_tier.join(" "), /Personal GPS/);
  assert.ok(TRAVEL_PLUS.paid_exclusive.length >= 3);
  assert.match(TRAVEL_PLUS.cancel_and_renew_terms.cancel, /Cancel/);
  assert.match(TRAVEL_PLUS.cancel_and_renew_terms.tax, /Stripe Tax/);
});

test("default env keeps sales/checkout/billing OFF (no accidental charges)", () => {
  const status = travelPlusStatus({});
  assert.equal(status.sales_enabled, false);
  assert.equal(status.checkout_enabled, false);
  assert.equal(status.billing_enabled, false);
  assert.equal(status.armed, false);
  assert.equal(status.user_chargeable, false);
  assert.equal(status.free_features_preserved, true);
  const prereq = ownerPrerequisites({});
  assert.equal(prereq.armed, false);
  assert.ok(prereq.missing.some((m) => /STRIPE_TRAVEL_PLUS_PRICE_ID|STRIPE_SECRET_KEY|SALES_ENABLED/i.test(m)));
});

test("checkout params refuse when not armed — charge_created path blocked", () => {
  const built = buildCheckoutSessionParams({
    env: {},
    origin: "https://havkar.online",
    userId: "user-1",
    customerEmail: "a@example.com"
  });
  assert.equal(built.ok, false);
  assert.equal(built.error, "travel_plus_not_armed");
  assert.equal(built.status, 403);
});

test("checkout params build Stripe subscription session when Owner arms gates", () => {
  const env = {
    STRIPE_SECRET_KEY: "sk_test_dummy",
    STRIPE_TRAVEL_PLUS_PRICE_ID: "price_travel_plus_test",
    HAVKAR_TRAVEL_PLUS_SALES_ENABLED: "true",
    HAVKAR_TRAVEL_PLUS_CHECKOUT_ENABLED: "true",
    HAVKAR_TRAVEL_PLUS_BILLING_ENABLED: "true",
    HAVKAR_TRAVEL_PLUS_AUTO_RENEW_ENABLED: "true",
    HAVKAR_TRAVEL_PLUS_AUTOMATIC_TAX: "true"
  };
  const status = travelPlusStatus(env);
  assert.equal(status.armed, true);
  assert.equal(status.automatic_tax_enabled, true);

  const built = buildCheckoutSessionParams({
    env,
    origin: "https://havkar.online",
    userId: "9b34b0bb-271a-49ee-aeb7-a9d28be06a06",
    customerEmail: "owner@example.com"
  });
  assert.equal(built.ok, true);
  assert.equal(built.params.mode, "subscription");
  assert.equal(built.params.line_items[0].price, "price_travel_plus_test");
  assert.equal(built.params.subscription_data.trial_period_days, 30);
  assert.equal(built.params.automatic_tax.enabled, true);
  assert.equal(built.params.metadata.havkar_flow, "travel_plus");
  assert.equal(built.params.payment_method_collection, "always");
  assert.ok(built.idempotencyKey.indexOf("havkar-travel-plus-") === 0);
  assert.match(built.security.pci, /never hits HAVKAR/i);
});

test("portal refuses until sales + portal ready", () => {
  const denied = buildPortalSessionParams({
    env: { HAVKAR_TRAVEL_PLUS_SALES_ENABLED: "true" },
    origin: "https://havkar.online",
    customerId: "cus_1"
  });
  assert.equal(denied.ok, false);
  const ok = buildPortalSessionParams({
    env: {
      HAVKAR_TRAVEL_PLUS_SALES_ENABLED: "true",
      HAVKAR_TRAVEL_PLUS_PORTAL_READY: "true"
    },
    origin: "https://havkar.online",
    customerId: "cus_1"
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.params.customer, "cus_1");
});

test("webhook classifier recognizes travel_plus events", () => {
  assert.equal(
    isTravelPlusEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { havkar_flow: "travel_plus", havkar_purpose: "travel_plus_subscription" }
        }
      }
    }),
    true
  );
  assert.equal(
    isTravelPlusEvent({
      type: "customer.subscription.deleted",
      data: {
        object: { metadata: { havkar_purpose: "travel_plus_subscription" } }
      }
    }),
    true
  );
  assert.equal(
    isTravelPlusEvent({
      type: "checkout.session.completed",
      data: { object: { metadata: { havkar_flow: "marketplace" } } }
    }),
    false
  );
});

test("verified checkout upsert is gated by billing flag", async () => {
  const calls = [];
  const supabase = {
    from() {
      return {
        upsert(row) {
          calls.push(row);
          return {
            select() {
              return {
                async maybeSingle() {
                  return { data: row, error: null };
                }
              };
            }
          };
        }
      };
    }
  };
  const off = await applyVerifiedCheckoutSession({
    supabase,
    env: {},
    event: { livemode: false },
    session: {
      mode: "subscription",
      metadata: { havkar_user_id: "u1" },
      subscription: "sub_1",
      customer: "cus_1"
    }
  });
  assert.equal(off.ok, false);
  assert.equal(off.error, "travel_plus_billing_off");
  assert.equal(calls.length, 0);

  const on = await applyVerifiedCheckoutSession({
    supabase,
    env: {
      HAVKAR_TRAVEL_PLUS_BILLING_ENABLED: "true",
      STRIPE_TRAVEL_PLUS_PRICE_ID: "price_x"
    },
    event: { livemode: false },
    session: {
      mode: "subscription",
      metadata: { havkar_user_id: "u1" },
      subscription: "sub_1",
      customer: "cus_1"
    }
  });
  assert.equal(on.ok, true);
  assert.equal(on.free_features_preserved, true);
  assert.equal(calls[0].user_id, "u1");
  assert.equal(calls[0].stripe_subscription_id, "sub_1");
});

test("entitlement statuses", () => {
  assert.equal(isEntitledStatus("active"), true);
  assert.equal(isEntitledStatus("trialing"), true);
  assert.equal(isEntitledStatus("canceled"), false);
});

test("API/webhook/UI wiring present", () => {
  const api = fs.readFileSync("api/create-event-checkout.js", "utf8");
  assert.match(api, /isTravelPlusRequest/);
  assert.match(api, /travel_plus_checkout/);
  assert.match(api, /handleTravelPlusAction/);
  const wh = fs.readFileSync("api/stripe-webhook.js", "utf8");
  assert.match(wh, /isTravelPlusEvent/);
  assert.match(wh, /TRAVEL_PLUS_BILLING_OFF/);
  const html = fs.readFileSync("tickets.html", "utf8");
  assert.match(html, /travelPlusSubscribeBtn/);
  assert.match(html, /travelPlusManageBtn/);
  assert.match(html, /travel_plus_checkout/);
  assert.equal(fs.existsSync("supabase/migrations/20261125223000_travel_plus_subscriptions.sql"), true);
  assert.equal(fs.existsSync("lib/travel-plus-api.cjs"), true);
});

test("previous free Travel Plus honesty tests still hold on empty env", () => {
  const status = travelPlusStatus();
  assert.equal(status.free_features_preserved, true);
  assert.equal(status.sales_enabled, false);
});

console.log("TRAVEL_PLUS_STRIPE_READY_TEST_OK");
