import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeFlags = ["--no-experimental-require-module"];
const stagingUrl = "https://keglioewbkgdabsizvys.supabase.co";
const localServiceKey = "sb_secret_local_test_only";

function response() {
  return {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    }
  };
}

async function invoke(env) {
  const { handleStellarPayment } = await import("../api/stellar-payment.mjs");
  const res = response();

  await handleStellarPayment({
    method: "GET",
    headers: {},
    url: "/api/stellar-payment"
  }, res, { env });

  return res;
}

if (process.env.HAVKAR_VERCEL_LOAD_CHILD === "1") {
  const missing = await invoke({ VERCEL_ENV: "preview" });
  assert.equal(missing.statusCode, 503);
  assert.match(missing.body.error, /not configured/);

  const anonymous = await invoke({
    VERCEL_ENV: "preview",
    HAVKAR_STAGING_SUPABASE_URL: stagingUrl,
    HAVKAR_STAGING_SERVICE_ROLE_KEY: localServiceKey
  });
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.body.error, "Authentication required.");

  const production = await invoke({
    VERCEL_ENV: "production",
    HAVKAR_STAGING_SUPABASE_URL: stagingUrl,
    HAVKAR_STAGING_SERVICE_ROLE_KEY: localServiceKey
  });
  assert.equal(production.statusCode, 503);
  assert.match(production.body.error, /disabled on production/);

  console.log("STELLAR_VERCEL_LOAD_OK");
  process.exit(0);
}

const wallet = fs.readFileSync(path.join(root, "stellar-wallet-source.js"), "utf8");
const bundle = fs.readFileSync(path.join(root, "stellar-wallet-bundle.js"), "utf8");
assert.match(wallet, /STELLAR_MAINNET_PAYMENTS_ENABLED\s*=\s*false/);
assert.equal(bundle.includes("STELLAR_MAINNET_PAYMENTS_ENABLED = false"), true);
assert.equal(fs.existsSync(path.join(root, "api/stellar-payment.js")), false);
assert.equal(fs.existsSync(path.join(root, "lib/stellar-payment-core.js")), false);
assert.equal(fs.existsSync(path.join(root, "api/stellar-payment.mjs")), true);

const cjs = spawnSync(process.execPath, [
  ...nodeFlags,
  "-e",
  "require('@stellar/stellar-sdk')"
], { cwd: root, encoding: "utf8" });
const cjsOutput = `${cjs.stdout}\n${cjs.stderr}`;
assert.notEqual(cjs.status, 0);
assert.match(cjsOutput, /ERR_REQUIRE_ESM/);
assert.match(cjsOutput, /uint8array-extras/);

const child = spawnSync(process.execPath, [
  ...nodeFlags,
  path.join(root, "tests/stellar-vercel-load.test.mjs")
], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...process.env,
    HAVKAR_VERCEL_LOAD_CHILD: "1"
  }
});

if (child.status !== 0) {
  process.stderr.write(child.stdout || "");
  process.stderr.write(child.stderr || "");
}

assert.equal(child.status, 0);
assert.match(child.stdout, /STELLAR_VERCEL_LOAD_OK/);
console.log("STELLAR_VERCEL_LOAD_PARENT_OK");
