import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const {
  PRODUCTION_SUPABASE_URL,
  STAGING_SUPABASE_URL,
  enforcedSupabaseUrl,
  realPaymentsAllowed,
  requestHostname
} = require("../server/supabase-target.cjs");

const configSource = fs.readFileSync(
  new URL("../havkar-supabase-config.js", import.meta.url),
  "utf8"
);
const mobileConfig = fs.readFileSync(
  new URL("../mobile/src/public-config.mjs", import.meta.url),
  "utf8"
);

function loadConfig(hostname) {
  const context = {
    window: {
      location: {
        hostname
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(configSource, context, { filename: "havkar-supabase-config.js" });
  return context.window.HAVKAR_SUPABASE_CONFIG;
}

const firstUrl = configSource.match(/url:\s*"([^"]+)"/)[1];
const firstKey = configSource.match(/publishableKey:\s*"([^"]+)"/)[1];

assert.equal(firstUrl, PRODUCTION_SUPABASE_URL);
assert.equal(mobileConfig.includes(firstUrl), true);
assert.equal(mobileConfig.includes(firstKey), true);
assert.equal(mobileConfig.includes("keglioewbkgdabsizvys"), false);
assert.equal(configSource.includes("eyJ"), false);

for (const host of [
  "havkar-app.vercel.app",
  "testnet.havkar.online",
  "localhost",
  "127.0.0.1",
  ""
]) {
  const config = loadConfig(host);
  assert.equal(config.url, PRODUCTION_SUPABASE_URL, host);
  assert.equal(config.publishableKey, firstKey, host);
  assert.equal(config.url.includes("keglioewbkgdabsizvys"), false, host);
}

const staging = loadConfig("staging.havkar.online");
assert.equal(staging.url, STAGING_SUPABASE_URL);
assert.equal(staging.url.includes("gispovnciifgikvgpzck"), false);
assert.match(staging.publishableKey, /^sb_publishable_/);
assert.notEqual(staging.publishableKey, firstKey);

for (const host of [
  "havkar-dij7w3uxo-havkarapp2026-4055s-projects.vercel.app",
  "havkar-app-git-main-havkarapp2026-4055s-projects.vercel.app",
  "havkar-app-havkarapp2026-4055s-projects.vercel.app",
  "preview.havkar.online",
  "evil.example"
]) {
  const config = loadConfig(host);
  assert.equal(config.url, "", host);
  assert.equal(config.publishableKey, "", host);
}

assert.equal(
  enforcedSupabaseUrl(
    { headers: { host: "havkar-app.vercel.app" } },
    PRODUCTION_SUPABASE_URL
  ),
  PRODUCTION_SUPABASE_URL
);
assert.equal(
  enforcedSupabaseUrl(
    { headers: { host: "staging.havkar.online" } },
    STAGING_SUPABASE_URL
  ),
  STAGING_SUPABASE_URL
);
assert.equal(
  enforcedSupabaseUrl(
    { headers: { host: "staging.havkar.online" } },
    PRODUCTION_SUPABASE_URL
  ),
  ""
);
assert.equal(
  enforcedSupabaseUrl(
    { headers: { host: "havkar-app.vercel.app" } },
    STAGING_SUPABASE_URL
  ),
  ""
);
assert.equal(
  enforcedSupabaseUrl(
    { headers: { host: "havkar-app-git-cursor-busin-8fca83-havkarapp2026-4055s-projects.vercel.app" } },
    PRODUCTION_SUPABASE_URL
  ),
  ""
);
assert.equal(
  enforcedSupabaseUrl(
    { headers: { host: "havkar-app-git-cursor-busin-8fca83-havkarapp2026-4055s-projects.vercel.app" } },
    STAGING_SUPABASE_URL
  ),
  ""
);
assert.equal(
  enforcedSupabaseUrl({ headers: {} }, "https://example.supabase.co"),
  "https://example.supabase.co"
);
assert.equal(
  requestHostname({ headers: { host: "staging.havkar.online:443" } }),
  "staging.havkar.online"
);
assert.equal(realPaymentsAllowed(""), true);
assert.equal(realPaymentsAllowed("havkar-app.vercel.app"), true);
assert.equal(realPaymentsAllowed("testnet.havkar.online"), true);
assert.equal(realPaymentsAllowed("staging.havkar.online"), false);
assert.equal(
  realPaymentsAllowed("havkar-dij7w3uxo-havkarapp2026-4055s-projects.vercel.app"),
  false
);

const { createDeleteAccountHandler } = await import("../server/delete-account.js");
const deleteHandler = createDeleteAccountHandler({
  getAdmin() {
    throw new Error("staging origin check must not open a database client");
  }
});

function mockRes() {
  return {
    statusCode: 200,
    ended: false,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      this.ended = true;
    }
  };
}

const stagingCrossSite = mockRes();
await deleteHandler({
  method: "OPTIONS",
  url: "/api/delete-account",
  headers: {
    origin: "https://staging.havkar.online",
    host: "havkar-app.vercel.app"
  }
}, stagingCrossSite);
assert.equal(stagingCrossSite.statusCode, 403);

const stagingSameSite = mockRes();
await deleteHandler({
  method: "OPTIONS",
  url: "/api/delete-account",
  headers: {
    origin: "https://staging.havkar.online",
    host: "staging.havkar.online"
  }
}, stagingSameSite);
assert.equal(stagingSameSite.statusCode, 204);
assert.equal(
  stagingSameSite.headers["access-control-allow-origin"],
  "https://staging.havkar.online"
);

const previousFlag = process.env.HAVKAR_PI_PAYMENTS_ENABLED;
const previousKey = process.env.PI_API_KEY;
process.env.HAVKAR_PI_PAYMENTS_ENABLED = "true";
process.env.PI_API_KEY = "test-pi-key-not-a-secret";
const calls = [];
const previousFetch = global.fetch;
global.fetch = async (url) => {
  calls.push(String(url));
  return {
    status: 200,
    async text() {
      return "{}";
    }
  };
};

try {
  const { default: approve } = await import("../api/pi-approve.js");
  const blocked = mockRes();
  await approve({
    method: "POST",
    url: "/api/pi-approve",
    query: {},
    headers: { host: "staging.havkar.online" },
    body: { paymentId: "pay_1" }
  }, blocked);
  assert.equal(blocked.statusCode, 404);
  assert.equal(calls.length, 0);

  const preview = mockRes();
  await approve({
    method: "POST",
    url: "/api/pi-approve",
    query: {},
    headers: { host: "havkar-dij7w3uxo-havkarapp2026-4055s-projects.vercel.app" },
    body: { paymentId: "pay_1" }
  }, preview);
  assert.equal(preview.statusCode, 404);
  assert.equal(calls.length, 0);

  const production = mockRes();
  await approve({
    method: "POST",
    url: "/api/pi-approve",
    query: {},
    headers: { host: "havkar-app.vercel.app" },
    body: { paymentId: "pay_1" }
  }, production);
  assert.equal(production.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].includes("api.minepi.com"), true);
} finally {
  global.fetch = previousFetch;
  if (previousFlag === undefined) {
    delete process.env.HAVKAR_PI_PAYMENTS_ENABLED;
  } else {
    process.env.HAVKAR_PI_PAYMENTS_ENABLED = previousFlag;
  }
  if (previousKey === undefined) {
    delete process.env.PI_API_KEY;
  } else {
    process.env.PI_API_KEY = previousKey;
  }
}

const previousStripeKey = process.env.STRIPE_SECRET_KEY;
const previousSupabaseUrl = process.env.SUPABASE_URL;
const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.STRIPE_SECRET_KEY;
process.env.SUPABASE_URL = previousSupabaseUrl || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole || "test-service-role";

try {
  const { default: checkout } = await import("../api/create-event-checkout.js");
  const { default: webhook } = await import("../api/stripe-webhook.js");
  const checkoutRes = mockRes();
  await checkout({
    method: "POST",
    headers: { host: "staging.havkar.online" },
    body: {}
  }, checkoutRes);
  assert.equal(checkoutRes.statusCode, 404);
  assert.equal(checkoutRes.body.error, "Not found");

  const webhookRes = mockRes();
  await webhook({
    method: "POST",
    headers: { host: "staging.havkar.online" }
  }, webhookRes);
  assert.equal(webhookRes.statusCode, 404);
  assert.equal(webhookRes.body.error, "Not found");
} finally {
  if (previousStripeKey === undefined) {
    delete process.env.STRIPE_SECRET_KEY;
  } else {
    process.env.STRIPE_SECRET_KEY = previousStripeKey;
  }
  if (previousSupabaseUrl === undefined) {
    delete process.env.SUPABASE_URL;
  } else {
    process.env.SUPABASE_URL = previousSupabaseUrl;
  }
  if (previousServiceRole === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
  }
}

console.log("STAGING_WEB_CONFIG_TEST_OK");
