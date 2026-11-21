import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const buySell = fs.readFileSync("buy-sell.html", "utf8");
const search = fs.readFileSync("search.html", "utf8");
const adDetails = fs.readFileSync("ad-details.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");
const swRegister = fs.readFileSync("havkar-sw-register.js", "utf8");

test("Buy & Sell exposes a single public UI version stamp", () => {
  assert.match(buySell, /HAVKAR_BUYSELL_UI = "20261120-unify-v1"/);
  assert.match(buySell, /name="havkar-buysell-ui" content="20261120-unify-v1"/);
});

test("Buy & Sell default grid is three columns for every visitor", () => {
  assert.match(
    buySell,
    /\.ads-grid,\s*\.skeleton-grid\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/
  );
});

test("Search nav opens the shared search hub, not in-page explore-only mode", () => {
  assert.match(buySell, /search\.html\?scope=buy-sell/);
  assert.doesNotMatch(
    buySell,
    /onClick\("navSearch", \(\) => \{\s*state\.savedOnly = false;\s*state\.exploreMode = true/
  );
  assert.match(adDetails, /search\.html\?scope=buy-sell/);
});

test("Search hub forwards Buy & Sell queries to buy-sell.html", () => {
  assert.match(search, /return "buy-sell\.html\?q=" \+ encoded/);
  assert.match(search, /Buy &amp; Sell/);
});

test("Service worker version bumps with the Buy & Sell unify release", () => {
  assert.match(sw, /havkar-sw-20261120-buysell-unify-v1/);
  assert.match(swRegister, /havkar-sw-20261120-buysell-unify-v1/);
  assert.match(buySell, /havkar-sw-register\.js/);
});

test("Clear filters control exists for country/search mismatches", () => {
  assert.match(buySell, /id="clearListingFilters"/);
  assert.match(buySell, /function clearListingFilters\(/);
});
