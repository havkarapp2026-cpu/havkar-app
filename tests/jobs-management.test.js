"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const jobs = require("../havkar-jobs.js");

const ownerId = "11111111-1111-1111-1111-111111111111";

function draft(extra) {
  return Object.assign({
    title: "Pizza Chef",
    company: "HAVKAR Kitchen",
    location: "Crotone, Italy",
    type: "Full-time",
    salary: "€1,800/month",
    skills: ["Pizza", "Cooking"],
    description: "Prepare pizzas for the evening service.",
    requirements: "One year of kitchen experience",
    contact: "chef@example.com",
    application_url: "https://jobs.example.com/apply"
  }, extra || {});
}

function mockClient(handler) {
  const calls = [];
  return {
    calls: calls,
    from(table) {
      const state = {
        table: table,
        op: "",
        payload: null,
        filters: [],
        select: ""
      };
      const chain = {
        insert(payload) {
          state.op = "insert";
          state.payload = payload;
          return chain;
        },
        update(payload) {
          state.op = "update";
          state.payload = payload;
          return chain;
        },
        delete() {
          state.op = "delete";
          return chain;
        },
        eq(column, value) {
          state.filters.push([column, value]);
          return chain;
        },
        select(columns) {
          state.select = columns;
          return chain;
        },
        single() {
          state.single = true;
          return chain;
        },
        then(resolve, reject) {
          calls.push(state);
          return Promise.resolve(handler(state)).then(resolve, reject);
        }
      };
      return chain;
    }
  };
}

function savedRow(payload, id) {
  return Object.assign({
    id: id || 7,
    created_at: "2026-10-08T00:00:00Z",
    user_id: ownerId,
    status: payload.status || "pending_payment",
    expires_at: null,
    remote: payload.remote,
    category: null,
    language: null,
    experience_level: null,
    education_level: null,
    currency: null,
    salary_min: null,
    salary_max: null,
    image: payload.image || null,
    plan: payload.plan || "Basic",
    monthly_fee: payload.monthly_fee || 9.99
  }, payload);
}

(async function run() {
  const inserted = jobs.buildJobInsert(
    draft({ status: "active", plan: "Business", monthly_fee: 1, user_id: "other" }),
    ownerId,
    { name: "Basic", price: 9.99 }
  );
  assert.strictEqual(inserted.ok, true);
  assert.strictEqual(inserted.payload.status, "pending_payment");
  assert.strictEqual(inserted.payload.plan, "Basic");
  assert.strictEqual(inserted.payload.monthly_fee, 9.99);
  assert.strictEqual(inserted.payload.user_id, ownerId);
  assert.strictEqual(inserted.payload.application_url, "https://jobs.example.com/apply");
  assert.strictEqual(inserted.payload.contact, "chef@example.com");
  assert.strictEqual(inserted.payload.remote, false);

  const remoteInsert = jobs.buildJobInsert(
    draft({ type: "Remote", application_url: "", contact: "" }),
    ownerId,
    { name: "Professional", price: 19.99 }
  );
  assert.strictEqual(remoteInsert.payload.remote, true);
  assert.strictEqual(remoteInsert.payload.application_url, null);
  assert.strictEqual(remoteInsert.payload.contact, null);
  assert.strictEqual(remoteInsert.payload.status, "pending_payment");

  assert.strictEqual(
    jobs.buildJobInsert(draft(), ownerId, { name: "Basic", price: 1 }).ok,
    false
  );
  assert.strictEqual(
    jobs.buildJobInsert(draft({ application_url: "javascript:alert(1)" }), ownerId, { name: "Basic", price: 9.99 }).reason,
    "invalid_application_url"
  );

  const updated = jobs.buildJobUpdate(draft({
    status: "active",
    plan: "Business",
    monthly_fee: 0,
    user_id: "other",
    id: 99,
    created_at: "2020-01-01"
  }));
  assert.strictEqual(updated.ok, true);
  jobs.BLOCKED_UPDATE_FIELDS.forEach(function (field) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(updated.payload, field), false, field);
  });
  assert.strictEqual(updated.payload.title, "Pizza Chef");
  assert.strictEqual(updated.payload.skills, "Pizza, Cooking");
  assert.strictEqual(updated.payload.requirements, "One year of kitchen experience");

  const client = mockClient(function (state) {
    if (state.op === "update" && state.filters.length === 0) {
      return { data: [], error: null };
    }
    if (state.op === "delete") {
      return { data: [{ id: 7 }], error: null };
    }
    return { data: [savedRow(state.payload, 7)], error: null };
  });

  const updateResult = await jobs.updateOwnJob(client, {
    jobId: 7,
    userId: ownerId,
    draft: draft({ status: "active", plan: "Business", monthly_fee: 39.99 })
  });
  assert.strictEqual(updateResult.ok, true);
  const updateCall = client.calls[0];
  assert.strictEqual(updateCall.table, "jobs");
  assert.strictEqual(updateCall.op, "update");
  assert.deepStrictEqual(updateCall.filters, [["id", 7], ["user_id", ownerId]]);
  assert.strictEqual(updateCall.payload.status, undefined);
  assert.strictEqual(updateCall.payload.plan, undefined);
  assert.strictEqual(updateCall.payload.monthly_fee, undefined);
  assert.strictEqual(updateCall.payload.user_id, undefined);

  const emptyClient = mockClient(function () {
    return { data: [], error: null };
  });
  const emptyUpdate = await jobs.updateOwnJob(emptyClient, {
    jobId: 7,
    userId: ownerId,
    draft: draft()
  });
  assert.strictEqual(emptyUpdate.ok, false);
  assert.strictEqual(emptyUpdate.reason, "not_confirmed");

  const deleteResult = await jobs.deleteOwnJob(client, {
    jobId: 7,
    userId: ownerId
  });
  assert.strictEqual(deleteResult.ok, true);
  const deleteCall = client.calls[client.calls.length - 1];
  assert.strictEqual(deleteCall.op, "delete");
  assert.deepStrictEqual(deleteCall.filters, [["id", 7], ["user_id", ownerId]]);
  assert.strictEqual(deleteCall.select, "id");

  const emptyDelete = await jobs.deleteOwnJob(emptyClient, {
    jobId: 7,
    userId: ownerId
  });
  assert.strictEqual(emptyDelete.ok, false);
  assert.strictEqual(emptyDelete.reason, "not_confirmed");

  const createClient = mockClient(function (state) {
    assert.strictEqual(state.payload.status, "pending_payment");
    return { data: savedRow(state.payload, 8), error: null };
  });
  const created = await jobs.createOwnJob(createClient, {
    userId: ownerId,
    plan: { name: "Business", price: 39.99 },
    draft: draft({ status: "active" })
  });
  assert.strictEqual(created.ok, true);
  assert.strictEqual(created.row.status, "pending_payment");
  assert.strictEqual(createClient.calls[0].single, true);

  const active = {
    status: "active",
    expires_at: null,
    application_url: "https://jobs.example.com/apply",
    contact: "chef@example.com"
  };
  assert.strictEqual(jobs.contactAction(active).kind, "url");
  assert.strictEqual(jobs.contactAction(active).href, "https://jobs.example.com/apply");

  const emailJob = Object.assign({}, active, { application_url: "" });
  assert.strictEqual(jobs.contactAction(emailJob).kind, "email");
  assert.strictEqual(jobs.contactAction(emailJob).href, "mailto:chef@example.com");

  const phoneJob = Object.assign({}, active, {
    application_url: "javascript:alert(1)",
    contact: "+39 333 123 4567"
  });
  const phoneAction = jobs.contactAction(phoneJob);
  assert.strictEqual(phoneAction.kind, "phone");
  assert.strictEqual(phoneAction.href, "tel:+393331234567");

  const textJob = Object.assign({}, active, {
    application_url: "",
    contact: "Ask for Marco at the front desk"
  });
  assert.strictEqual(jobs.contactAction(textJob).kind, "text");
  assert.strictEqual(jobs.contactAction(textJob).text, "Ask for Marco at the front desk");

  const missing = jobs.contactAction(Object.assign({}, active, {
    application_url: "",
    contact: ""
  }));
  assert.strictEqual(missing.available, false);
  assert.strictEqual(missing.label, "Application contact is not available.");

  const pending = jobs.contactAction({
    status: "pending_payment",
    application_url: "https://jobs.example.com/apply",
    contact: "chef@example.com"
  });
  assert.strictEqual(pending.available, false);
  assert.strictEqual(pending.reason, "inactive");

  const expired = jobs.contactAction({
    status: "active",
    expires_at: "2020-01-01T00:00:00Z",
    application_url: "https://jobs.example.com/apply"
  }, Date.parse("2026-10-08T00:00:00Z"));
  assert.strictEqual(expired.available, false);

  assert.strictEqual(jobs.jobStatusKind({ status: "pending_payment" }), "pending_payment");
  assert.strictEqual(jobs.jobStatusKind({ status: "active", expires_at: null }), "active");
  assert.strictEqual(jobs.jobStatusKind({
    status: "active",
    expires_at: "2020-01-01T00:00:00Z"
  }, Date.parse("2026-10-08T00:00:00Z")), "expired");
  assert.strictEqual(jobs.isListedJob({ status: "pending_payment", owner: false }), false);
  assert.strictEqual(jobs.isListedJob({ status: "pending_payment", owner: true }), true);
  assert.strictEqual(jobs.isListedJob({
    status: "active",
    expires_at: "2020-01-01T00:00:00Z",
    owner: false
  }, Date.parse("2026-10-08T00:00:00Z")), false);

  const listings = [
    {
      title: "Chef",
      company: "Kitchen",
      location: "Crotone",
      type: "Full-time",
      job_type: "Full-time",
      remote: false,
      skills: ["Pizza"],
      description: "Oven work",
      requirements: "Italian language",
      category: "Hospitality",
      contact: "secret@example.com",
      application_url: "https://secret.example/apply"
    },
    {
      title: "Driver",
      company: "Routes",
      location: "Milan",
      type: "Full-time",
      job_type: "Full-time",
      remote: true,
      skills: [],
      description: "City deliveries",
      experience_level: "Junior"
    },
    {
      title: "Designer",
      company: "Studio",
      location: "Rome",
      type: "contract",
      job_type: "contract",
      remote: false,
      skills: "Figma",
      description: "Brand work"
    }
  ];

  assert.strictEqual(jobs.filterJobs(listings, { filter: "Remote" }).length, 1);
  assert.strictEqual(jobs.filterJobs(listings, { filter: "Contract" })[0].title, "Designer");
  assert.strictEqual(jobs.filterJobs(listings, { query: "italian language" })[0].title, "Chef");
  assert.strictEqual(jobs.filterJobs(listings, { query: "hospitality" })[0].title, "Chef");
  assert.strictEqual(jobs.filterJobs(listings, { query: "junior" })[0].title, "Driver");
  assert.strictEqual(jobs.filterJobs(listings, { location: "crotone" })[0].title, "Chef");
  assert.strictEqual(jobs.filterJobs(listings, { query: "secret@example.com" }).length, 0);
  assert.strictEqual(jobs.filterJobs(listings, { query: "secret.example" }).length, 0);
  assert.strictEqual(jobs.jobSearchHaystack(listings[0]).includes("secret@example.com"), false);

  const page = fs.readFileSync(path.join(__dirname, "../jobs.html"), "utf8");
  const moduleSource = fs.readFileSync(path.join(__dirname, "../havkar-jobs.js"), "utf8");
  assert.ok(page.includes('<script src="/havkar-jobs.js"></script>'));
  assert.ok(page.includes('<script src="/havkar-i18n.js"></script>'));
  assert.ok(page.includes("createOwnJob"));
  assert.ok(page.includes("updateOwnJob"));
  assert.ok(page.includes("deleteOwnJob"));
  assert.ok(page.includes("contactAction"));
  assert.ok(page.includes("filterJobs"));
  assert.ok(page.includes('id="locationInput"'));
  assert.ok(page.includes("pending_payment"));
  assert.ok(page.includes("/api/create-job-checkout"));
  assert.ok(page.includes("pending_confirmation"));
  assert.ok(page.includes("Returning from payment does not activate the advertisement."));
  assert.ok(page.includes("Your advertisement has NOT been activated."));
  assert.ok(moduleSource.includes("isStripeCheckoutUrl"));
  assert.ok(moduleSource.includes("checkout.stripe.com"));
  assert.strictEqual(
    jobs.isStripeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_123"),
    true
  );
  assert.strictEqual(jobs.isStripeCheckoutUrl("https://jobs.example/pay"), false);
  assert.ok(!page.includes("Application started for"));
  assert.ok(!page.includes('status:"active"'));
  assert.ok(!page.includes("status: \"active\""));
  assert.ok(!moduleSource.includes('status:"active"'));
  assert.ok(!moduleSource.includes("status: \"active\""));
  assert.ok(moduleSource.includes('payload.status = "pending_payment"'));

  const services = fs.readFileSync(path.join(__dirname, "../services.html"), "utf8");
  assert.ok(!services.includes("havkar-jobs.js"));

  console.log("JOBS_MANAGEMENT_TEST_OK");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
