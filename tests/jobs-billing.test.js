"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const billing = require("../havkar-job-billing.js");
const jobs = require("../havkar-jobs.js");

assert.deepStrictEqual(
  Object.fromEntries(Object.entries(billing.ORDINARY_PLANS).map(function (entry) {
    return [entry[0], entry[1].eur];
  })),
  { Basic: 9.99, Professional: 19.99, Business: 39.99 }
);
assert.strictEqual(billing.ordinaryAmountCents("Basic"), 999);
assert.strictEqual(billing.ordinaryAmountCents("Professional"), 1999);
assert.strictEqual(billing.ordinaryAmountCents("Business"), 3999);
assert.strictEqual(billing.COMPANY_PLANS.business.cents, 4999);
assert.strictEqual(billing.COMPANY_PLANS.business.activeAdvertisementLimit, 10);
assert.strictEqual(billing.COMPANY_PLANS.business_plus.activeAdvertisementLimit, 30);
assert.strictEqual(billing.COMPANY_PLANS.enterprise.activeAdvertisementLimit, 100);
assert.strictEqual(billing.FAILURE_POLICY.deleteAdvertisements, false);
assert.strictEqual(billing.companyMaySubscribe(null).ok, false);
assert.strictEqual(billing.companyMaySubscribe({ verification_status: "pending" }).code, "company_not_verified");
assert.strictEqual(billing.companyMaySubscribe({ verification_status: "verified" }).ok, true);

const paidInvoice = billing.decideBillingEvent({
  type: "invoice.paid",
  data: {
    object: {
      subscription: "sub_1",
      amount_paid: 4999,
      currency: "eur",
      period_end: 1790000000
    }
  }
});
assert.strictEqual(paidInvoice.action, "subscription_paid");
assert.strictEqual(paidInvoice.deleteAdvertisements, false);
assert.strictEqual(paidInvoice.currentPeriodEnd, new Date(1790000000 * 1000).toISOString());

assert.strictEqual(billing.paymentsEnabled({}), false);
assert.strictEqual(billing.paymentsEnabled({ HAVKAR_JOB_PAYMENTS_ENABLED: "false" }), false);
assert.strictEqual(billing.jobCheckoutDecision({}).callStripe, false);
assert.strictEqual(billing.jobCheckoutDecision({}).status, 503);

const limit = billing.withinAdvertisementLimit("business", 10);
assert.strictEqual(limit.ok, false);
assert.strictEqual(limit.reason, "limit_reached");
assert.strictEqual(billing.withinAdvertisementLimit("business", 9).ok, true);
assert.strictEqual(billing.withinAdvertisementLimit("business", 9).countedUnit, "advertisement");

const now = Date.parse("2026-10-11T00:00:00Z");
assert.strictEqual(billing.subscriptionAllowsPublicAds({
  status: "past_due",
  current_period_end: "2026-11-11T00:00:00Z"
}, now), false);
assert.strictEqual(billing.subscriptionAllowsPublicAds({
  status: "active",
  current_period_end: "2026-11-11T00:00:00Z"
}, now), true);

const expiry = billing.nextOrdinaryExpiry(now, null);
assert.strictEqual(
  expiry.expiresAt,
  new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString()
);

const paid = billing.decideCheckoutSession({
  mode: "payment",
  payment_status: "paid",
  amount_total: 999,
  currency: "eur",
  metadata: {
    havkar_purpose: "job_advertisement",
    job_id: "15",
    user_id: "user-1",
    plan: "Basic"
  }
});
assert.strictEqual(paid.action, "activate_ordinary_job");

const mismatch = billing.decideCheckoutSession({
  mode: "payment",
  payment_status: "paid",
  amount_total: 100,
  currency: "eur",
  metadata: {
    havkar_purpose: "job_advertisement",
    job_id: "15",
    user_id: "user-1",
    plan: "Basic"
  }
});
assert.strictEqual(mismatch.activate, false);
assert.strictEqual(mismatch.reason, "amount_mismatch");

const ticket = billing.decideCheckoutSession({
  metadata: { event_ticket_id: "ticket-1", havkar_purpose: "job_advertisement" }
});
assert.strictEqual(ticket.reason, "event_ticket");

const failed = billing.decideBillingEvent({
  type: "invoice.payment_failed",
  data: { object: { subscription: "sub_123" } }
});
assert.strictEqual(failed.deleteAdvertisements, false);
assert.strictEqual(failed.hideFromPublicSearch, true);

const unpaid = billing.decideCheckoutSession({
  mode: "payment",
  payment_status: "unpaid",
  amount_total: 999,
  currency: "eur",
  metadata: {
    havkar_purpose: "job_advertisement",
    job_id: "15",
    user_id: "user-1",
    plan: "Basic"
  }
});
assert.strictEqual(unpaid.ok, false);
assert.strictEqual(unpaid.reason, "not_paid");
assert.strictEqual(billing.eventClaimDecision("processing").resume, true);
assert.strictEqual(billing.eventClaimDecision("activated").duplicate, true);
assert.strictEqual(billing.eventClaimDecision(null).proceed, true);
assert.strictEqual(jobs.isPublicListing({
  status: "pending_payment",
  expires_at: "2026-12-01T00:00:00Z"
}, now), false);
assert.strictEqual(jobs.isListedJob({
  status: "pending_payment",
  owner: false,
  expires_at: "2026-12-01T00:00:00Z"
}, now), false);
assert.strictEqual(jobs.isPublicListing({
  status: "active",
  expires_at: null
}, now), true);
assert.strictEqual(jobs.isPublicListing({
  status: "active",
  expires_at: "2026-09-01T00:00:00Z"
}, now), false);

assert.strictEqual(billing.isJobBillingEvent({
  type: "invoice.paid",
  data: { object: { metadata: {} } }
}), false);
assert.strictEqual(billing.isJobBillingEvent({
  type: "customer.subscription.updated",
  data: { object: { metadata: { havkar_purpose: "job_subscription" } } }
}), true);

const company = jobs.buildCompanyJobInsert({
  title: "Welder",
  company: "HAVKAR Plant",
  location: "Crotone",
  type: "Full-time",
  description: "Weld assemblies for the production line.",
  positions: 10
}, "11111111-1111-1111-1111-111111111111", "business", "22222222-2222-2222-2222-222222222222");
assert.strictEqual(company.ok, true);
assert.strictEqual(company.payload.status, "pending_payment");
assert.strictEqual(company.payload.positions_count, 10);
assert.strictEqual(company.payload.employer_kind, "company");
assert.strictEqual(company.payload.monthly_fee, null);

const commerceApi = fs.readFileSync(path.join(__dirname, "../havkar-commerce-api.js"), "utf8");
const verificationGate = commerceApi.indexOf("companyMaySubscribe");
const subscriptionCheckout = commerceApi.indexOf('mode: "subscription"');
assert.ok(verificationGate > 0);
assert.ok(verificationGate < subscriptionCheckout);

const webhook = fs.readFileSync(path.join(__dirname, "../api/stripe-webhook.js"), "utf8");
const noTicket = webhook.indexOf("if (!ticketId)");
const jobPurpose = webhook.indexOf("job_advertisement");
const ticketUpdate = webhook.indexOf('payment_status: "paid"');
assert.ok(noTicket > 0);
assert.ok(noTicket < jobPurpose);
assert.ok(jobPurpose < ticketUpdate);
assert.ok(webhook.includes("event_ticket_id"));

const migration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20261011120000_jobs_payment_security.sql"),
  "utf8"
);
assert.strictEqual(migration.includes("DELETE FROM public.jobs"), false);
assert.strictEqual(migration.includes("DROP TABLE public.jobs"), false);
assert.ok(migration.includes("pending_payment"));
assert.ok(migration.includes("job_publicly_visible"));
assert.ok(migration.includes("DROP TRIGGER IF EXISTS enforce_job_publication_status ON public.jobs"));
assert.ok(migration.includes("DROP FUNCTION IF EXISTS public.enforce_job_publication_status()"));
assert.ok(migration.includes("active_advertisement_limit"));
assert.strictEqual(/^\s*BEGIN\s*;/m.test(migration), false);
assert.strictEqual(/^\s*COMMIT\s*;/m.test(migration), false);
for (const match of migration.matchAll(/CREATE POLICY\s+("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\s+ON\s+((?:public|storage)\.[A-Za-z_][A-Za-z0-9_]*)/g)) {
  const drop = "DROP POLICY IF EXISTS " + match[1] + " ON " + match[2];
  assert.ok(migration.lastIndexOf(drop, match.index) >= 0, drop);
}

async function verifyUnpaidDoesNotActivate() {
  let jobUpdates = 0;
  const supabase = {
    from: function (table) {
      return {
        insert: function () {
          return {
            select: async function () {
              return { data: { stripe_event_id: "evt_unpaid" }, error: null };
            }
          };
        },
        update: function () {
          if (table === "jobs") jobUpdates += 1;
          return this;
        },
        select: function () { return this; },
        eq: function () { return this; },
        in: function () { return this; },
        or: function () { return this; },
        maybeSingle: async function () {
          return { data: null, error: null };
        }
      };
    }
  };
  const unpaidSession = await billing.applyVerifiedCheckoutSession({
    supabase: supabase,
    event: { id: "evt_unpaid", type: "checkout.session.completed" },
    session: {
      id: "cs_unpaid",
      mode: "payment",
      payment_status: "unpaid",
      amount_total: 999,
      currency: "eur",
      metadata: {
        havkar_purpose: "job_advertisement",
        job_id: "15",
        user_id: "user-1",
        plan: "Basic"
      }
    }
  });
  assert.strictEqual(unpaidSession.reason, "not_paid");
  assert.strictEqual(jobUpdates, 0);

  const calls = [];
  const mismatch = await billing.applyVerifiedBillingEvent({
    supabase: {
      from: function (table) {
        const api = {
          insert: function () {
            calls.push(table + ":insert");
            return {
              select: function () {
                return {
                  maybeSingle: async function () {
                    return { data: { stripe_event_id: "evt_invoice_bad" }, error: null };
                  }
                };
              }
            };
          },
          update: function (patch) {
            calls.push(table + ":update:" + (patch && patch.status || ""));
            return api;
          },
          select: function () { return api; },
          eq: function () { return api; },
          maybeSingle: async function () {
            return { data: { plan_code: "business" }, error: null };
          }
        };
        return api;
      }
    },
    event: {
      id: "evt_invoice_bad",
      type: "invoice.paid",
      data: {
        object: {
          subscription: "sub_1",
          amount_paid: 100,
          currency: "eur",
          metadata: { havkar_purpose: "job_subscription" }
        }
      }
    }
  });
  assert.strictEqual(mismatch.reason, "amount_mismatch");
  assert.strictEqual(mismatch.activated, false);
  assert.strictEqual(calls.indexOf("jobs:update:"), -1);
  assert.ok(calls.indexOf("job_subscriptions:update:needs_review") !== -1);
}

verifyUnpaidDoesNotActivate().catch(function (error) {
  console.error(error);
  process.exit(1);
});
