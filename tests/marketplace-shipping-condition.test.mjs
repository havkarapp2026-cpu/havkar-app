/**
 * Shipping filter + condition helpers for Buy & Sell.
 * No live Stripe charges.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mkt = require("../havkar-marketplace.js");

assert.equal(mkt.normalizeCondition(null), "unspecified");
assert.equal(mkt.normalizeCondition("NEW"), "new");
assert.equal(mkt.normalizeCondition("weird"), "unspecified");
assert.equal(mkt.normalizeShippingOption(null), "unspecified");
assert.equal(mkt.normalizeShippingOption(null, "delivery"), "shipping");
assert.equal(mkt.normalizeShippingOption("both"), "both");
assert.equal(mkt.conditionLabel("used"), "Used");
assert.equal(mkt.shippingOptionLabel("pickup"), "Pickup only");

assert.equal(
  mkt.listingMatchesPriceAndCity(
    { condition: "used", shipping_option: "pickup", price: 10, currency: "EUR" },
    { condition: "used", shipping: "pickup" }
  ),
  true
);
assert.equal(
  mkt.listingMatchesPriceAndCity(
    { condition: "used", shipping_option: "pickup", price: 10, currency: "EUR" },
    { condition: "new" }
  ),
  false
);
assert.equal(
  mkt.listingMatchesPriceAndCity(
    { condition: "used", shipping_option: "pickup", price: 10, currency: "EUR" },
    { shipping: "shipping" }
  ),
  false
);

const buysell = fs.readFileSync(
  new URL("../buy-sell.html", import.meta.url),
  "utf8"
);
assert.match(buysell, /id="shippingFilter"/);
assert.match(buysell, /id="conditionFilter"/);
assert.match(buysell, /shipping_option/);
assert.match(buysell, /conditionFilter/);

const migration = fs.readFileSync(
  new URL(
    "../supabase/migrations/20261123050000_marketplace_shipping_condition.sql",
    import.meta.url
  ),
  "utf8"
);
assert.match(migration, /shipping_option/);
assert.match(migration, /unspecified/);
assert.match(migration, /AND condition IS NULL/);
assert.match(migration, /AND shipping_option IS NULL/);

const details = fs.readFileSync(
  new URL("../ad-details.html", import.meta.url),
  "utf8"
);
assert.match(details, /id="shippingMeta"/);
assert.match(details, /id="conditionMeta"/);

console.log("MARKETPLACE_SHIPPING_CONDITION_TEST_OK");
