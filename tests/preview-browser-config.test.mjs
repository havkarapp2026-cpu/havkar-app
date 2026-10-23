import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import middleware from "../middleware.js";

const require = createRequire(import.meta.url);
const {
  BROWSER_CONFIG_PATH,
  PAYMENT_PREVIEW_BRANCH,
  PRODUCTION_PROJECT_REF,
  STAGING_SUPABASE_URL,
  isolatedPaymentPreviewBrowserConfig
} = require("../api/payment-isolation.cjs");

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const savedEnv = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
  HAVKAR_STAGING_SUPABASE_URL: process.env.HAVKAR_STAGING_SUPABASE_URL,
  HAVKAR_STAGING_PUBLISHABLE_KEY: process.env.HAVKAR_STAGING_PUBLISHABLE_KEY
};

function restoreEnv() {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

function useEnv(env) {
  for (const name of Object.keys(savedEnv)) {
    delete process.env[name];
  }
  Object.assign(process.env, env);
}

const exampleKey = "sb_publishable_example_only";
const exampleHash = await crypto.subtle.digest(
  "SHA-256",
  new TextEncoder().encode(exampleKey)
).then((digest) => Array.from(new Uint8Array(digest), (byte) => {
  return byte.toString(16).padStart(2, "0");
}).join(""));

const paymentEnv = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: PAYMENT_PREVIEW_BRANCH,
  HAVKAR_STAGING_SUPABASE_URL: STAGING_SUPABASE_URL,
  HAVKAR_STAGING_PUBLISHABLE_KEY: exampleKey
};

const valid = await isolatedPaymentPreviewBrowserConfig(
  BROWSER_CONFIG_PATH,
  paymentEnv,
  { expectedPublishableSha256: exampleHash }
);
assert.equal(valid.status, 200);
assert.equal(valid.contentType, "application/javascript; charset=utf-8");
assert.match(valid.body, new RegExp(STAGING_SUPABASE_URL.replace(/[.]/g, "\\.")));
assert.equal(valid.body.includes(exampleKey), true);
assert.equal(valid.body.includes(PRODUCTION_PROJECT_REF), false);
assert.equal(valid.body.includes("service_role"), false);
assert.equal(valid.body.includes("eyJ"), false);

const invalidCases = [
  { ...paymentEnv, HAVKAR_STAGING_SUPABASE_URL: "" },
  { ...paymentEnv, HAVKAR_STAGING_PUBLISHABLE_KEY: "" },
  {
    ...paymentEnv,
    HAVKAR_STAGING_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`
  },
  {
    ...paymentEnv,
    HAVKAR_STAGING_SUPABASE_URL: `${STAGING_SUPABASE_URL}/`
  },
  {
    ...paymentEnv,
    HAVKAR_STAGING_PUBLISHABLE_KEY: "eyJhbGciOiJIUzI1NiJ9.payload.sig"
  },
  {
    ...paymentEnv,
    HAVKAR_STAGING_PUBLISHABLE_KEY: "sb_publishable_service_role_value"
  },
  {
    ...paymentEnv,
    HAVKAR_STAGING_PUBLISHABLE_KEY: `sb_publishable_${PRODUCTION_PROJECT_REF}`
  },
  {
    ...paymentEnv,
    HAVKAR_STAGING_PUBLISHABLE_KEY: "sb_publishable_wrong"
  }
];

for (const env of invalidCases) {
  const rejected = await isolatedPaymentPreviewBrowserConfig(
    BROWSER_CONFIG_PATH,
    env,
    { expectedPublishableSha256: exampleHash }
  );
  assert.equal(rejected.status, 503);
  assert.equal(rejected.body.includes(PRODUCTION_PROJECT_REF), false);
  assert.equal(rejected.body.includes("service_role"), false);
  assert.equal(rejected.body.includes("eyJ"), false);
  assert.equal(rejected.body.includes(exampleKey), false);
  assert.equal(rejected.body.includes("sb_publishable_wrong"), false);
  assert.equal(rejected.body.includes(STAGING_SUPABASE_URL), false);
}

assert.equal(
  await isolatedPaymentPreviewBrowserConfig(BROWSER_CONFIG_PATH, {
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: PAYMENT_PREVIEW_BRANCH,
    HAVKAR_STAGING_SUPABASE_URL: STAGING_SUPABASE_URL,
    HAVKAR_STAGING_PUBLISHABLE_KEY: exampleKey
  }),
  null
);
assert.equal(
  await isolatedPaymentPreviewBrowserConfig(BROWSER_CONFIG_PATH, {
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "cursor/message-receipts-6a44",
    HAVKAR_STAGING_SUPABASE_URL: STAGING_SUPABASE_URL,
    HAVKAR_STAGING_PUBLISHABLE_KEY: exampleKey
  }),
  null
);
assert.equal(
  await isolatedPaymentPreviewBrowserConfig("/login.html", paymentEnv),
  null
);

useEnv(paymentEnv);
const served = await middleware(new Request(`https://preview.example${BROWSER_CONFIG_PATH}`));
assert.equal(served.status, 503);
assert.equal(served.headers.get("cache-control"), "no-store");
const servedText = await served.text();
assert.equal(servedText.includes(PRODUCTION_PROJECT_REF), false);
assert.equal(servedText.includes(STAGING_SUPABASE_URL), false);

useEnv({
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: "main",
  HAVKAR_STAGING_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
  HAVKAR_STAGING_PUBLISHABLE_KEY: "sb_publishable_wrong"
});
assert.equal(
  await middleware(new Request(`https://havkar-app.vercel.app${BROWSER_CONFIG_PATH}`)),
  undefined
);

useEnv({
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "cursor/message-receipts-6a44"
});
assert.equal(
  await middleware(new Request(`https://preview.example${BROWSER_CONFIG_PATH}`)),
  undefined
);

const realKey = savedEnv.HAVKAR_STAGING_PUBLISHABLE_KEY;
if (realKey) {
  useEnv({
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: PAYMENT_PREVIEW_BRANCH,
    HAVKAR_STAGING_SUPABASE_URL: STAGING_SUPABASE_URL,
    HAVKAR_STAGING_PUBLISHABLE_KEY: realKey
  });
  const live = await middleware(new Request(`https://preview.example${BROWSER_CONFIG_PATH}`));
  assert.equal(live.status, 200);
  assert.equal(live.headers.get("cache-control"), "no-store");
  assert.match(live.headers.get("content-type"), /^application\/javascript/);
  const liveText = await live.text();
  assert.equal(liveText.includes(STAGING_SUPABASE_URL), true);
  assert.equal(liveText.includes(PRODUCTION_PROJECT_REF), false);
  assert.equal(liveText.includes("service_role"), false);
  assert.equal(liveText.includes("eyJ"), false);
  assert.equal(liveText.includes(realKey), true);
}

restoreEnv();

const login = fs.readFileSync(path.join(root, "login.html"), "utf8");
assert.equal(login.includes(PRODUCTION_PROJECT_REF), false);
assert.equal(login.includes("havkar-app.vercel.app"), false);
assert.match(login, /window\.location\.replace\(\s*"index\.html"\s*\)/);
assert.match(login, /new URL\("login\.html", window\.location\.href\)\.href/);

const middlewareSource = fs.readFileSync(path.join(root, "middleware.js"), "utf8");
assert.match(middlewareSource, /\/havkar-supabase-config\.js/);
assert.match(middlewareSource, /cache-control": "no-store"/);

const apiFunctions = fs.readdirSync(path.join(root, "api"))
  .filter((name) => name.endsWith(".js"));
assert.ok(apiFunctions.length <= 12);
assert.equal(apiFunctions.includes("havkar-supabase-config.js"), false);

const stellar = fs.readFileSync(path.join(root, "stellar-wallet-source.js"), "utf8");
assert.match(stellar, /STELLAR_MAINNET_PAYMENTS_ENABLED\s*=\s*false/);

console.log("PREVIEW_BROWSER_CONFIG_OK");
