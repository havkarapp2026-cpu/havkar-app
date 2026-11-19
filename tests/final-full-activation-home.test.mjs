import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const ticketsHtml = readFileSync(new URL("../tickets.html", import.meta.url), "utf8");
const chatHtml = readFileSync(new URL("../chat.html", import.meta.url), "utf8");
const deliveryHtml = readFileSync(new URL("../delivery.html", import.meta.url), "utf8");
const accommodationHtml = readFileSync(new URL("../accommodation.html", import.meta.url), "utf8");

test("home restores Support and About within 15 tiles", () => {
  const tiles = [...indexHtml.matchAll(/class="menu-item"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(tiles.length, 15);
  assert.ok(tiles.includes("support.html"));
  assert.ok(tiles.includes("about.html"));
  assert.ok(!tiles.includes("coming-soon.html"));
  assert.ok(!tiles.includes("calls.html"));
});

test("tickets categories precede map panel and taxi shortcut removed from bottom nav", () => {
  const typesIdx = ticketsHtml.indexOf('class="ticket-types"');
  const mapIdx = ticketsHtml.indexOf('id="travelMapPanel"');
  assert.ok(typesIdx > 0 && mapIdx > typesIdx);
  assert.ok(!/id="navTransfer"/.test(ticketsHtml));
  assert.ok(/id="navChat"/.test(ticketsHtml));
});

test("chat read receipt uses hollow ring classes without checkmark text for read", () => {
  assert.ok(/\.message-checks\.read\{/.test(chatHtml));
  assert.ok(/golden|ffd54f|ffca28/i.test(chatHtml));
  assert.ok(/havkar_chat_outbox_v1/.test(chatHtml));
  assert.ok(/element\.textContent = ""/.test(chatHtml));
});

test("delivery has interactive map host", () => {
  assert.ok(/id="deliveryMapHost"/.test(deliveryHtml));
  assert.ok(/havkar-map\.js/.test(deliveryHtml));
  assert.ok(/never simulated|Never simulated|no fake|No fake|never simulated/i.test(deliveryHtml));
});

test("accommodation discovery feed precedes map tools", () => {
  const feedIdx = accommodationHtml.indexOf('id="listings"');
  const mapToolsIdx = accommodationHtml.indexOf("Map, dates");
  assert.ok(feedIdx > 0 && mapToolsIdx > 0 && feedIdx < mapToolsIdx);
  assert.ok(/acc-feed/.test(accommodationHtml));
});

test("jobs ordinary plans are labeled 30-day prepaid not monthly subscription", () => {
  const jobsHtml = readFileSync(new URL("../jobs.html", import.meta.url), "utf8");
  assert.ok(/30-day prepaid listing plan/.test(jobsHtml));
  assert.ok(/€9\.99 \/ 30 days/.test(jobsHtml));
  assert.ok(!/Choose a monthly publishing plan/.test(jobsHtml));
  assert.ok(/action:\s*"jobs_quote"|\"jobs_quote\"/.test(jobsHtml));
});

test("wallet gates Mainnet peer send on payment-status live collection", () => {
  const walletHtml = readFileSync(new URL("../wallet.html", import.meta.url), "utf8");
  assert.ok(/refreshCurrencyRailsHonesty/.test(walletHtml));
  assert.ok(/HAVKAR_XLM_MAINNET_LIVE_COLLECTION/.test(walletHtml));
  assert.ok(/\/api\/payment-status/.test(walletHtml));
});
