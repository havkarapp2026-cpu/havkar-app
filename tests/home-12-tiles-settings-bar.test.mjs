/**
 * Owner mandate: Home has exactly 12 tiles in fixed order + one settings bar.
 * Language / Support / About pages must still exist (access moved to Settings).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const indexHtml = fs.readFileSync("index.html", "utf8");

test("home exposes exactly 12 service tiles", () => {
  const gridMatch = indexHtml.match(/<nav[\s\S]*?class="menu-grid"[\s\S]*?<\/nav>/);
  assert.ok(gridMatch, "menu-grid nav missing");
  const tiles = [...gridMatch[0].matchAll(/<a class="menu-item"/g)];
  assert.equal(tiles.length, 12);
});

test("home tile order matches Owner 4x3 layout", () => {
  const gridMatch = indexHtml.match(/<nav[\s\S]*?class="menu-grid"[\s\S]*?<\/nav>/)[0];
  const hrefs = [...gridMatch.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, [
    "buy-sell.html",
    "jobs.html",
    "services.html",
    "wallet.html",
    "tickets.html",
    "accommodation.html",
    "ads.html",
    "delivery.html",
    "events.html",
    "chat.html",
    "havkar-ai.html",
    "health.html"
  ]);
});

test("Languages Support About removed from home grid but pages remain", () => {
  const gridMatch = indexHtml.match(/<nav[\s\S]*?class="menu-grid"[\s\S]*?<\/nav>/)[0];
  const hrefs = [...gridMatch.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(hrefs.includes("language.html"), false);
  assert.equal(hrefs.includes("support.html"), false);
  assert.equal(hrefs.includes("about.html"), false);
  assert.equal(fs.existsSync("language.html"), true);
  assert.equal(fs.existsSync("support.html"), true);
  assert.equal(fs.existsSync("about.html"), true);
});

test("HAVKAR AI sits in former language slot before doctors tile", () => {
  const gridMatch = indexHtml.match(/<nav[\s\S]*?class="menu-grid"[\s\S]*?<\/nav>/)[0];
  const ai = gridMatch.indexOf("havkar-ai.html");
  const health = gridMatch.indexOf("health.html");
  const chat = gridMatch.indexOf("chat.html");
  assert.ok(chat < ai && ai < health);
});

test("messenger logo asset is unchanged", () => {
  assert.match(
    indexHtml,
    /assets\/home\/chat\.png\?v=owner-approved-mint-20261119/
  );
});

test("home has one full-width settings bar and no nested duplicate settings CTA", () => {
  assert.match(indexHtml, /class="home-settings-bar"/);
  assert.match(indexHtml, /data-i18n="Profile &amp; Settings"/);
  const signedIn = indexHtml.match(/id="signedInPanel"[\s\S]*?<\/div>/)[0];
  assert.equal(/href="profile\.html"/.test(signedIn), false);
  assert.match(signedIn, /data-i18n="Signed in"/);
});
