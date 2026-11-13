import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  moduleCatalog,
  buildGlobalPaymentQuote,
  refuseLiveCheckout,
  AI_CREDIT_PACKS,
  JOB_LISTING_PLANS
} = require("../lib/havkar-global-payments.cjs");
const { evaluateStellarCheckout, ALLOWED_XLM_FLOWS } = require("../lib/stellar-checkout.cjs");

const catalog = moduleCatalog();
assert.equal(catalog.ok, true);
assert.equal(typeof catalog.public_live_checkout, "boolean");
assert.equal(catalog.stripe.currency_count, 60);
assert.ok(Array.isArray(catalog.modules));
assert.ok(catalog.modules.length >= 9);

const byId = Object.fromEntries(catalog.modules.map((row) => [row.id, row]));
assert.ok(["implemented_gated", "live_armed"].includes(byId.marketplace.xlm));
assert.ok(["implemented_gated", "live_armed"].includes(byId.services.xlm));
assert.ok(["implemented_gated", "live_armed"].includes(byId.events.xlm));
assert.ok(["implemented_gated", "live_armed"].includes(byId.jobs.xlm));
assert.ok(["implemented_gated", "live_armed"].includes(byId.ai.xlm));
assert.ok(["implemented_gated", "live_armed"].includes(byId.ads.xlm));
assert.ok(["implemented_gated", "live_armed"].includes(byId.business.xlm));
assert.equal(byId.flights.xlm, "blocked_pending_duffel_live");
assert.equal(byId.flights.stripe, "blocked_pending_duffel_live");
assert.equal(byId.omio_rail.checkout_controller, "external_partner");
assert.equal(byId.omio_rail.xlm, "not_applicable");
assert.equal(byId.trade.xlm, "refused");

assert.ok(ALLOWED_XLM_FLOWS.includes("jobs_listing"));
assert.ok(ALLOWED_XLM_FLOWS.includes("ai_credits"));
assert.ok(ALLOWED_XLM_FLOWS.includes("ads"));
assert.ok(ALLOWED_XLM_FLOWS.includes("business_listing"));
assert.ok(ALLOWED_XLM_FLOWS.includes("flights"));

const jobsQuote = evaluateStellarCheckout({
  flow: "jobs_listing",
  price: 19.99,
  subject_id: "123",
  idempotency_key: "jobs-list-12345678"
});
assert.equal(jobsQuote.ok, true);
assert.equal(jobsQuote.paid, false);

const aiQuote = evaluateStellarCheckout({
  flow: "ai_credits",
  price: AI_CREDIT_PACKS[0].list_price_eur,
  subject_id: AI_CREDIT_PACKS[0].id,
  idempotency_key: "ai-credits-12345678"
});
assert.equal(aiQuote.ok, true);

const legacyAi = evaluateStellarCheckout({
  flow: "ai",
  price: 10,
  idempotency_key: "legacy-ai-12345678"
});
assert.equal(legacyAi.code, "XLM_RECURRING_UNSUPPORTED");

const recurring = evaluateStellarCheckout({
  flow: "subscription",
  price: 10,
  idempotency_key: "sub-12345678"
});
assert.equal(recurring.code, "XLM_RECURRING_UNSUPPORTED");

const stripeQuote = await buildGlobalPaymentQuote({
  module: "ai",
  method: "stripe",
  currency: "usd",
  subject_id: "ai_credits_plus"
});
assert.equal(stripeQuote.ok, true);
assert.equal(typeof stripeQuote.public_live_checkout, "boolean");
assert.ok(stripeQuote.quote);
assert.ok(Number(stripeQuote.quote.buyer_pays) > 0);

const omio = await buildGlobalPaymentQuote({
  module: "omio_rail",
  method: "stripe",
  currency: "eur",
  list_price_eur: 40
});
assert.equal(omio.ok, false);
assert.equal(omio.code, "EXTERNAL_PARTNER_CHECKOUT");

const refused = refuseLiveCheckout("stripe");
assert.ok(refused.code === "GLOBAL_LIVE_CHECKOUT_NOT_ARMED" || refused.code === "LIVE_CHECKOUT_ARMED");
if (refused.code === "GLOBAL_LIVE_CHECKOUT_NOT_ARMED") {
  assert.equal(refused.ok, false);
  assert.match(refused.error, /No payment was taken/i);
} else {
  assert.equal(refused.ok, true);
  assert.equal(refused.public_live_checkout, true);
}

const api = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(api, /isGlobalPaymentsRequest/);
assert.match(api, /jobs_listing/);
assert.match(api, /ai_credits/);
assert.match(api, /business_listing/);

const vercel = fs.readFileSync("vercel.json", "utf8");
assert.match(vercel, /\/api\/global-payments/);

const jobsHtml = fs.readFileSync("jobs.html", "utf8");
assert.match(jobsHtml, /flow: "jobs_listing"/);
assert.match(jobsHtml, /\/api\/global-payments/);

const aiHtml = fs.readFileSync("havkar-ai.html", "utf8");
assert.match(aiHtml, /ai_credits_plus/);
assert.match(aiHtml, /\/api\/global-payments/);

assert.equal(JOB_LISTING_PLANS.length >= 1, true);

console.log("HAVKAR_GLOBAL_PAYMENTS_TEST_OK");
