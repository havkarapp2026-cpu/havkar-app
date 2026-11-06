const assert = require("assert");
const fs = require("fs");
const path = require("path");
const support = require("../lib/support-request.cjs");

const root = path.join(__dirname, "..");

function requestBody(extra) {
  return Object.assign({
    action: "create",
    topic: "login_registration",
    name: "Mina Karimi",
    email: "mina@example.com",
    message: "A new Gmail address could not sign in and no confirmation message arrived.",
    language: "fa",
    company_website: ""
  }, extra || {});
}

const valid = support.validateSupportRequest(requestBody());
assert.strictEqual(valid.ok, true);
assert.strictEqual(valid.value.language, "fa");
assert.strictEqual(support.validateSupportRequest(requestBody({ message: "too short" })).ok, false);
assert.strictEqual(support.validateSupportRequest(requestBody({ topic: "billing" })).ok, false);
assert.strictEqual(support.validateSupportRequest(requestBody({ company_website: "https://spam.example" })).status, 400);
assert.strictEqual(support.validateSupportRequest(requestBody({ language: "ku" })).ok, false);

const mailed = support.supportEmailMessage(valid.value, "AB23CD45EF");
assert.deepStrictEqual(mailed.to, ["info@havkar.online"]);
assert.strictEqual(mailed.reply_to, "mina@example.com");
assert.ok(mailed.html.includes("&lt;script&gt;") === false);
const escaped = support.supportEmailMessage(
  Object.assign({}, valid.value, { message: "<script>alert(1)</script> and enough detail" }),
  "AB23CD45EF"
);
assert.ok(escaped.html.includes("&lt;script&gt;"));
assert.ok(!escaped.html.includes("<script>"));

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

function mockSupabase(options) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      calls.push({ rpc: name, args });
      return Promise.resolve(options.budget || { data: true, error: null });
    },
    from(table) {
      return {
        insert(row) {
          calls.push({ table, row });
          return {
            select() {
              return {
                single() {
                  return Promise.resolve(options.insert || { data: { reference: row.reference }, error: null });
                }
              };
            }
          };
        },
        select() {
          const chain = {
            eq() { return chain; },
            gte() { return chain; },
            limit() {
              return Promise.resolve(options.recent || { data: [], error: null });
            },
            maybeSingle() {
              return Promise.resolve(options.status || { data: null, error: null });
            }
          };
          return chain;
        }
      };
    }
  };
}

(async function () {
  const previousKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const stored = mockSupabase({});
  const handler = support.createSupportRequestHandler({
    createSupabase: function () { return stored; },
    randomBytes: function () { return Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); }
  });
  const created = mockRes();
  await handler({
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.10" },
    body: requestBody()
  }, created);
  assert.strictEqual(created.statusCode, 200);
  assert.strictEqual(created.body.stored, true);
  assert.strictEqual(created.body.notified, false);
  assert.strictEqual(created.body.reference, support.createReference(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])));
  assert.ok(stored.calls.some(function (call) { return call.rpc === "consume_support_budget"; }));

  const limited = mockRes();
  await handler({
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.10" },
    body: requestBody()
  }, limited);
  assert.strictEqual(limited.statusCode, 200);

  const blocked = support.createSupportRequestHandler({
    createSupabase: function () {
      return mockSupabase({ budget: { data: false, error: null } });
    }
  });
  const tooMany = mockRes();
  await blocked({
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.11" },
    body: requestBody()
  }, tooMany);
  assert.strictEqual(tooMany.statusCode, 429);
  assert.strictEqual(tooMany.body.stored, false);

  process.env.RESEND_API_KEY = "re_test_not_a_real_key";
  const sent = [];
  const mailing = support.createSupportRequestHandler({
    createSupabase: function () { return mockSupabase({}); },
    fetchImpl: async function (url, init) {
      sent.push({ url, body: JSON.parse(init.body) });
      return { ok: true };
    }
  });
  const notified = mockRes();
  await mailing({
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.12" },
    body: requestBody()
  }, notified);
  assert.strictEqual(notified.body.notified, true);
  assert.strictEqual(notified.body.requester_notified, true);
  assert.strictEqual(sent.length, 2);
  assert.strictEqual(sent[0].body.to[0], "info@havkar.online");
  assert.strictEqual(sent[1].body.to[0], "mina@example.com");
  assert.ok(sent[1].body.html.includes(notified.body.reference));
  assert.ok(!sent[1].body.html.includes("could not sign in"));
  assert.ok(!sent[0].body.html.includes(process.env.RESEND_API_KEY));

  const duplicateCalls = [];
  const duplicateHandler = support.createSupportRequestHandler({
    createSupabase: function () {
      return mockSupabase({
        recent: {
          data: [{ reference: "KEEPME1234", message: requestBody().message }],
          error: null
        }
      });
    },
    fetchImpl: async function () {
      duplicateCalls.push(true);
      return { ok: true };
    }
  });
  const duplicate = mockRes();
  await duplicateHandler({
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.14" },
    body: requestBody()
  }, duplicate);
  assert.strictEqual(duplicate.statusCode, 200);
  assert.strictEqual(duplicate.body.duplicate, true);
  assert.strictEqual(duplicate.body.reference, "KEEPME1234");
  assert.strictEqual(duplicate.body.notified, false);
  assert.strictEqual(duplicateCalls.length, 0);

  const lookup = support.createSupportRequestHandler({
    createSupabase: function () {
      return mockSupabase({
        status: {
          data: { reference: "AB23CD45EF", status: "received", topic: "privacy", created_at: "2026-11-06T00:00:00Z" },
          error: null
        }
      });
    }
  });
  const status = mockRes();
  await lookup({
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.13" },
    body: { action: "status", reference: "ab23cd45ef", email: "mina@example.com" }
  }, status);
  assert.strictEqual(status.statusCode, 200);
  assert.strictEqual(status.body.status, "received");
  assert.strictEqual(status.body.message, undefined);

  if (previousKey === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = previousKey;
  }

  const page = fs.readFileSync(path.join(root, "support.html"), "utf8");
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const migration = fs.readFileSync(path.join(root, "supabase/migrations/20261106030000_support_requests.sql"), "utf8");
  const route = fs.readFileSync(path.join(root, "api/business-application-notify.js"), "utf8");
  assert.ok(page.includes("Password recovery"));
  assert.ok(page.includes("General support"));
  assert.ok(page.includes('id="supportForm"'));
  assert.ok(page.includes("/api/support-request"));
  assert.ok(page.includes("info@havkar.online"));
  assert.ok(page.includes("+39 334 263 2863"));
  assert.ok(page.includes("privacy.html"));
  assert.ok(page.includes("terms.html"));
  assert.ok(page.includes("privacy-request.html"));
  assert.ok(page.includes('value="ckb"'));
  assert.ok(page.includes('value="kmr"'));
  assert.ok(vercel.rewrites.some(function (rule) {
    return rule.source === "/api/support-request" &&
      rule.destination === "/api/business-application-notify?havkarAction=support";
  }));
  assert.ok(route.includes("isSupportRequest"));
  assert.ok(migration.includes("REVOKE ALL ON TABLE public.support_requests FROM PUBLIC, anon, authenticated"));
  assert.ok(migration.includes("consume_support_budget"));
  assert.ok(!migration.includes("DELETE FROM"));
  assert.strictEqual(fs.readdirSync(path.join(root, "api")).filter(function (name) {
    return name.endsWith(".js");
  }).length, 12);

  console.log("SUPPORT_REQUEST_TEST_OK");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
