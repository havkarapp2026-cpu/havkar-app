import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  classifyStaysAccess,
  inferStaysBlocker,
  sanitizeDuffelErrors
} = require("../lib/duffel-stays.cjs");

const errors = sanitizeDuffelErrors({
  errors: [
    {
      type: "authorization_error",
      title: "Forbidden",
      code: "access_not_granted",
      message: "Stays is not enabled for this organization",
      documentation_url: "https://duffel.com/docs",
      source: { pointer: "/data" }
    }
  ]
});
assert.equal(errors.length, 1);
assert.equal(errors[0].code, "access_not_granted");

const inferred = inferStaysBlocker(403, errors, "test");
assert.equal(inferred.blocker_code, "DUFFEL_STAYS_PRODUCT_NOT_ENABLED");

const denied = classifyStaysAccess({
  token_mode: "test",
  http_status: 403,
  errors: []
});
assert.equal(denied.access, "denied");
assert.equal(denied.blocker_code, "DUFFEL_STAYS_FORBIDDEN_ON_TEST_TOKEN");
assert.match(denied.blocker_summary, /403/);

console.log("DUFFEL_STAYS_BLOCKER_TEST_OK");
