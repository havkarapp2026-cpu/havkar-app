/**
 * Owner Services EUR1 Connect prepare helpers.
 * No live Stripe charges in this test.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  SERVICES_LIST_EUR,
  SERVICES_PROBE_SERVICE_ID,
  MARKETPLACE_BUYER_USER_ID,
  OWNER_USER_ID,
  CONFIRM_PHRASE,
  isOwnerEur1Request,
  createOwnerServicesEur1CheckoutSession
} = require("../lib/owner-eur1-checkout.cjs");
const commerce = require("../havkar-service-commerce.js");

assert.equal(SERVICES_LIST_EUR, 1);
assert.equal(SERVICES_PROBE_SERVICE_ID, 12);
assert.notEqual(MARKETPLACE_BUYER_USER_ID, OWNER_USER_ID);
assert.equal(CONFIRM_PHRASE, "PREPARE_EUR_1_00_LIVE_CHECKOUT");
assert.equal(
  isOwnerEur1Request({
    body: { action: "owner_services_eur1_prepare" },
    url: "/api/owner-eur1-checkout"
  }),
  true
);

const settled = commerce.settleProviderCommission(100);
assert.equal(settled.settlement.customerChargeCents, 100);
assert.equal(settled.settlement.commissionCents, 10);
assert.equal(settled.settlement.providerSettlementCents, 90);

let created = null;
const stripe = {
  checkout: {
    sessions: {
      async create(params, opts) {
        created = { params, opts };
        return {
          id: "cs_test_svc_eur1",
          url: "https://checkout.stripe.com/c/pay/cs_test_svc_eur1",
          expires_at: 123,
          livemode: false
        };
      }
    }
  }
};

const prepared = await createOwnerServicesEur1CheckoutSession(
  stripe,
  "https://havkar.online",
  {
    serviceId: 12,
    serviceTitle: "probe",
    providerUserId: OWNER_USER_ID,
    connectedAccountId: "acct_1UeCtbEASAxGUTvG",
    bookingId: 999
  }
);
assert.equal(prepared.session.id, "cs_test_svc_eur1");
assert.equal(created.params.payment_intent_data.application_fee_amount, 10);
assert.equal(
  created.params.payment_intent_data.transfer_data.destination,
  "acct_1UeCtbEASAxGUTvG"
);
assert.equal(created.params.line_items[0].price_data.unit_amount, 100);
assert.equal(created.params.metadata.havkar_flow, "services");
assert.equal(created.params.metadata.owner_approved_eur1, "true");
assert.equal(created.params.metadata.service_id, "12");
assert.equal(created.params.metadata.booking_id, "999");

await assert.rejects(
  () =>
    createOwnerServicesEur1CheckoutSession(stripe, "https://havkar.online", {
      serviceId: 12,
      providerUserId: MARKETPLACE_BUYER_USER_ID,
      connectedAccountId: "acct_1UeCtbEASAxGUTvG",
      bookingId: 1,
      buyerUserId: MARKETPLACE_BUYER_USER_ID
    }),
  /independent/
);

const api = fs.readFileSync(
  new URL("../api/create-event-checkout.js", import.meta.url),
  "utf8"
);
assert.match(api, /owner_services_eur1_prepare/);
assert.match(api, /services_destination/);

const page = fs.readFileSync(
  new URL("../owner-eur1-checkout.html", import.meta.url),
  "utf8"
);
assert.match(page, /Prepare Services €1\.00 Checkout/);
assert.match(page, /owner_services_eur1_prepare/);

console.log("owner-services-eur1.test.mjs: OK");
