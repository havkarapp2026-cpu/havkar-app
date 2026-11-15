import assert from "node:assert/strict";
import fs from "node:fs";

// Tickets / Hotels / Jobs / Services must remain intact while Buy & Sell expands.
assert.match(fs.readFileSync("tickets.html", "utf8"), /ticketsWorldMap|HAVKAR Global Map/);
assert.match(fs.readFileSync("accommodation.html", "utf8"), /payStripeCard/);
assert.match(fs.readFileSync("jobs.html", "utf8"), /job/i);
assert.match(fs.readFileSync("services.html", "utf8"), /service/i);

const vercel = fs.readFileSync("vercel.json", "utf8");
for (const route of ["/api/hotels", "/api/jobs", "/api/services", "/api/marketplace"]) {
  assert.match(vercel, new RegExp(route.replace("/", "\\/")));
}

assert.ok(fs.existsSync("lib/havkar-hotels-api.cjs"));
assert.ok(fs.existsSync("lib/havkar-marketplace-api.cjs"));
assert.ok(fs.existsSync("havkar-tickets-map.js"));
assert.ok(fs.existsSync("havkar-buy-sell-map.js"));

console.log("BUY_SELL_REGRESSION_GUARD_TEST_OK");
