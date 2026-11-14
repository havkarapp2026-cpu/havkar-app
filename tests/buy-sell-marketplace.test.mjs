import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const market = require("../lib/havkar-marketplace-api.cjs");
const fees = require("../havkar-marketplace.js");
const { PRESENTMENT_COUNT } = require("../lib/stripe-supported-currencies-60.cjs");

assert.equal(PRESENTMENT_COUNT, 133);
assert.equal(market.PRESENTMENT_COUNT, 133);

const quote = market.feeQuote(100, "eur");
assert.equal(quote.ok, true);
assert.equal(quote.buyer_fee_eur, 2);
assert.equal(quote.seller_fee_eur, 3);
assert.equal(quote.buyer_pays_eur, 102);
assert.equal(quote.seller_receives_eur, 97);
assert.equal(quote.platform_commission_eur, 5);
assert.equal(quote.listing_publication_fee, 0);

const clientFees = fees.quoteListingFees(100, "USD");
assert.equal(clientFees.ok, true);
assert.equal(clientFees.currency, "USD");
assert.equal(clientFees.buyerFee, 2);
assert.equal(clientFees.sellerFee, 3);
assert.equal(typeof fees.applyServerListingFilters, "function");

const buySell = fs.readFileSync("buy-sell.html", "utf8");
assert.match(buySell, /data-view-mode="explore"/);
assert.match(buySell, /buySellWorldMap/);
assert.match(buySell, /havkar-buy-sell-map\.js/);
assert.match(buySell, /video-badge/);
assert.match(buySell, /setupVideoLightbox/);
assert.match(buySell, /toggleLiked/);
assert.match(buySell, /applyServerListingFilters/);
assert.match(buySell, /leaflet\.markercluster/);
assert.match(buySell, /leaflet@1\.9\.4/);
assert.doesNotMatch(buySell, /ads advertising module only/);

const product = fs.readFileSync("product.html", "utf8");
assert.match(product, /toggleFollowSeller/);
assert.match(product, /seller_follows/);
assert.match(product, /quoteStripeBtn/);
assert.match(product, /quoteXlmBtn/);
assert.match(product, /\/api\/marketplace/);
assert.match(product, /HAVKAR_TRADE_ENABLED/);
assert.match(fs.readFileSync("havkar-buy-sell-map.js", "utf8"), /markerClusterGroup|Approximate/);
assert.ok(fs.existsSync("supabase/migrations/20261114123000_seller_follows.sql"));

const vercel = fs.readFileSync("vercel.json", "utf8");
assert.match(vercel, /\/api\/marketplace/);
assert.match(vercel, /\/api\/hotels/);
assert.match(vercel, /\/api\/jobs/);

const checkout = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(checkout, /havkar-marketplace-api/);
assert.match(checkout, /havkar-hotels-api/);

const mapJs = fs.readFileSync("havkar-buy-sell-map.js", "utf8");
assert.match(mapJs, /Approximate/);
assert.match(mapJs, /exact home/i);
assert.match(mapJs, /action=geocode/);

console.log("BUY_SELL_MARKETPLACE_TEST_OK");
