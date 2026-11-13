import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  classifyDuffelAccessToken,
  duffelLiveOrdersReady
} = require("../lib/duffel-live-ready.cjs");

assert.equal(classifyDuffelAccessToken({}).mode, "missing");
assert.equal(
  classifyDuffelAccessToken({ DUFFEL_ACCESS_TOKEN: "duffel_test_abc" }).mode,
  "test"
);
assert.equal(
  duffelLiveOrdersReady({
    DUFFEL_ACCESS_TOKEN: "duffel_test_abc",
    HAVKAR_DUFFEL_LIVE_ORDERS_ENABLED: "true"
  }),
  false
);
assert.equal(
  duffelLiveOrdersReady({
    DUFFEL_ACCESS_TOKEN: "duffel_live_abc",
    HAVKAR_DUFFEL_LIVE_ORDERS_ENABLED: "true"
  }),
  true
);
assert.equal(
  duffelLiveOrdersReady({
    DUFFEL_ACCESS_TOKEN: "duffel_live_abc"
  }),
  false
);

console.log("DUFFEL_LIVE_READY_TEST_OK");
