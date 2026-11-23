/**
 * Services Stripe Connect destination checkout + webhook wiring.
 * No live charges.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serviceCommerce = require("../havkar-service-commerce.js");
const {
  buildServicesDestinationCheckoutParams,
  decideServicesCheckout,
  servicesPaymentsArmed
} = require("../lib/services-checkout.cjs");
const { processStripeEvent } = require("../lib/stripe-webhook-processor.cjs");

const apiSrc = fs.readFileSync(
  new URL("../api/create-event-checkout.js", import.meta.url),
  "utf8"
);
const webhookSrc = fs.readFileSync(
  new URL("../api/stripe-webhook.js", import.meta.url),
  "utf8"
);
const servicesHtml = fs.readFileSync(
  new URL("../services.html", import.meta.url),
  "utf8"
);

assert.match(apiSrc, /services_buy_checkout/);
assert.match(apiSrc, /services_request_completion/);
assert.match(apiSrc, /services_confirm_completion/);
assert.match(apiSrc, /services_review_create/);
assert.match(apiSrc, /services_complaint_create/);
assert.match(webhookSrc, /fulfillServiceBookingPayment/);
assert.match(servicesHtml, /havkar-service-commerce\.js/);
assert.match(servicesHtml, /services_buy_checkout/);
assert.match(servicesHtml, /showingMineOnly/);

assert.equal(serviceCommerce.APPROVED_COMMISSION_BPS, 1000);
const settled = serviceCommerce.settleProviderCommission(10000);
assert.equal(settled.ok, true);
assert.equal(settled.settlement.customerChargeCents, 10000);
assert.equal(settled.settlement.commissionCents, 1000);
assert.equal(settled.settlement.providerSettlementCents, 9000);

assert.equal(
  servicesPaymentsArmed({
    HAVKAR_REAL_PAYMENTS_ENABLED: "true",
    HAVKAR_SERVICE_PAYMENTS_ENABLED: "true"
  }),
  true
);

const denied = decideServicesCheckout(
  {
    HAVKAR_REAL_PAYMENTS_ENABLED: "true",
    HAVKAR_SERVICE_PAYMENTS_ENABLED: "false"
  },
  {
    agreedCents: 10000,
    connectedAccountId: "acct_test",
    providerVerified: true
  }
);
assert.equal(denied.callStripe, false);

const ready = decideServicesCheckout(
  {
    HAVKAR_REAL_PAYMENTS_ENABLED: "true",
    HAVKAR_SERVICE_PAYMENTS_ENABLED: "true"
  },
  {
    agreedCents: 10000,
    clientCustomerChargeCents: 10000,
    clientCommissionCents: 1000,
    clientCommissionBps: 1000,
    connectedAccountId: "acct_test",
    providerVerified: true
  }
);
assert.equal(ready.callStripe, true);
assert.equal(ready.applicationFeeCents, 1000);
assert.equal(ready.customerChargeCents, 10000);

const params = buildServicesDestinationCheckoutParams({
  amountCents: 10000,
  applicationFeeCents: 1000,
  connectedAccountId: "acct_test",
  currency: "eur",
  serviceTitle: "Cleaning",
  successUrl: "https://havkar.online/services.html?paid=1",
  cancelUrl: "https://havkar.online/services.html?paid=0",
  metadata: { booking_id: "12", customer_id: "u1" }
});
assert.equal(params.payment_intent_data.application_fee_amount, 1000);
assert.equal(
  params.payment_intent_data.transfer_data.destination,
  "acct_test"
);
assert.equal(params.metadata.havkar_flow, "services");
assert.equal(params.line_items[0].price_data.unit_amount, 10000);

let captured = null;
const store = {
  async insertEvent() {
    return { duplicate: false };
  },
  async fulfillServiceBookingPayment(payload) {
    captured = payload;
    return { applied: true, activated: true, ok: true };
  }
};

const paid = await processStripeEvent(
  {
    id: "evt_svc_1",
    type: "checkout.session.completed",
    livemode: true,
    data: {
      object: {
        id: "cs_svc_1",
        payment_status: "paid",
        amount_total: 10000,
        currency: "eur",
        metadata: {
          havkar_flow: "services",
          booking_id: "12",
          customer_id: "u1"
        }
      }
    }
  },
  store
);
assert.equal(paid.kind, "services");
assert.equal(paid.applied, true);
assert.ok(captured && captured.session);

console.log("services-stripe-checkout.test.mjs: ok");
