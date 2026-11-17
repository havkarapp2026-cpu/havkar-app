import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("buy-sell restores functional bottom nav without Profile and uses defensive binds", () => {
  const html = read("buy-sell.html");
  assert.match(html, /id="navHome"/);
  assert.match(html, /id="navSearch"/);
  assert.match(html, /id="navSaved"/);
  assert.match(html, /id="navMessages"/);
  assert.doesNotMatch(html, /id="navProfile"/);
  assert.doesNotMatch(html, /id="profileButton"/);
  assert.match(html, /function onClick\s*\(/);
  assert.match(html, /onClick\("navHome",\s*goAppHome\)/);
  assert.doesNotMatch(
    html,
    /\$\("navHome"\)\s*\n\s*\.addEventListener/
  );
  assert.match(
    html,
    /Buy & Sell page controls failed to start/
  );
});

test("module bottom navs restore Home without duplicate Profile icons", () => {
  const files = {
    "jobs.html": ["navHome", "navSearch", "navSaved", "navMessages"],
    "services.html": ["navSearch", "navSaved"],
    "ads.html": ["savedNavButton", "myCampaignsNavButton"],
    "chat.html": ["navHome", "navMessages", "navNotifications"],
    "delivery.html": ["goToDeliveryHistory"]
  };
  for (const [file, needles] of Object.entries(files)) {
    const html = read(file);
    assert.match(html, /bottom-nav/);
    assert.doesNotMatch(html, /id="navProfile"/);
    assert.doesNotMatch(html, /onclick="goProfile\(\)"/);
    assert.doesNotMatch(html, /onclick="openProfile\(\)"/);
    for (const needle of needles) {
      assert.match(html, new RegExp(needle));
    }
  }
  const events = read("events.html");
  assert.match(events, /onclick="goHome\(\)"/);
  assert.match(events, /onclick="openTickets\(\)"/);
  assert.doesNotMatch(events, /onclick="openProfile\(\)"/);
});

test("service worker cache bumped after stability recovery", () => {
  const sw = read("sw.js");
  const reg = read("havkar-sw-register.js");
  /* Later map-scope release supersedes the recovery-only SW tag. */
  assert.match(sw, /havkar-sw-20261117-maps-tickets-accommodation-only-v1/);
  assert.match(reg, /havkar-sw-20261117-maps-tickets-accommodation-only-v1/);
});

test("tickets bottom nav restores Home without Profile", () => {
  const html = read("tickets.html");
  assert.match(html, /href="index\.html"/);
  assert.match(html, /id="navTransfer"/);
  assert.doesNotMatch(html, /id="navProfile"/);
});
