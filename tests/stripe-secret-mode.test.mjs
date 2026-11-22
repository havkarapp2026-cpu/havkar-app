import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { stripeSecretMode } = require("../lib/real-payments.cjs");

assert.equal(stripeSecretMode({ STRIPE_SECRET_KEY: "sk_live_x" }), "live");
assert.equal(stripeSecretMode({ STRIPE_SECRET_KEY: "rk_live_x" }), "live");
assert.equal(stripeSecretMode({ STRIPE_SECRET_KEY: ' "sk_live_x" ' }), "live");
assert.equal(stripeSecretMode({ STRIPE_SECRET_KEY: "sk_test_x" }), "test");
assert.equal(stripeSecretMode({ STRIPE_SECRET_KEY: "rk_test_x" }), "test");
assert.equal(stripeSecretMode({ STRIPE_SECRET_KEY: "pk_live_x" }), "publishable_misconfigured");
assert.equal(stripeSecretMode({ STRIPE_SECRET_KEY: "" }), "missing");
assert.equal(stripeSecretMode({ STRIPE_SECRET_KEY: "not-a-key" }), "unknown");

const statusSource = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(statusSource, /stripeSecretMode/);
assert.doesNotMatch(
  statusSource,
  /const stripeMode = \/\^sk_live/
);

console.log("STRIPE_SECRET_MODE_TEST_OK");
