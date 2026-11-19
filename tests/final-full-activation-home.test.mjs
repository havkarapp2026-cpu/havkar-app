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
  const introDetailsIdx = ticketsHtml.indexOf('aria-label="About travel search"');
  assert.ok(typesIdx > 0 && mapIdx > typesIdx);
  assert.ok(introDetailsIdx > typesIdx, "category strip must appear before collapsible intro");
  assert.ok(/Choose a travel category/.test(ticketsHtml));
  assert.ok(/data-ticket-type="flight"/.test(ticketsHtml));
  assert.ok(/data-ticket-type="bus"/.test(ticketsHtml));
  assert.ok(/data-ticket-type="train"/.test(ticketsHtml));
  assert.ok(/data-ticket-type="ferry"/.test(ticketsHtml));
  assert.ok(/data-ticket-type="taxi"/.test(ticketsHtml));
  assert.ok(/data-ticket-type="transfer"/.test(ticketsHtml));
  assert.ok(!/id="navTransfer"/.test(ticketsHtml));
  assert.ok(/id="navChat"/.test(ticketsHtml));
});

test("events module supports create, checkout, QR and organizer check-in", () => {
  const eventsHtml = readFileSync(new URL("../events.html", import.meta.url), "utf8");
  assert.ok(/id="createEventForm"/.test(eventsHtml));
  assert.ok(/\/api\/create-event-checkout/.test(eventsHtml));
  assert.ok(/havkar_check_in_event_ticket/.test(eventsHtml));
  assert.ok(/ticket_code/.test(eventsHtml));
});

test("ads create currency matrix is collapsible and ads stay isolated from marketplace", () => {
  const adsHtml = readFileSync(new URL("../ads.html", import.meta.url), "utf8");
  assert.ok(/Currency \(133 fiat \+ XLM\) — tap to expand/.test(adsHtml));
  assert.ok(/id="adCurrencyMount"/.test(adsHtml));
  assert.ok(!/buy-sell\.html.*inject|injectAdvertisement/i.test(adsHtml));
});

test("health and calls stay honest about TURN / telehealth gates", () => {
  const healthHtml = readFileSync(new URL("../health.html", import.meta.url), "utf8");
  const callsHtml = readFileSync(new URL("../calls.html", import.meta.url), "utf8");
  assert.ok(/calls\.html/.test(healthHtml));
  assert.ok(/health-provider-apply\.html/.test(healthHtml));
  assert.ok(/BLOCKED/.test(callsHtml));
  assert.ok(/TURN/.test(callsHtml));
  assert.ok(/health_telehealth_status/.test(callsHtml));
});

test("HAVKAR AI keeps New Idea separate from Business Ideas", () => {
  const aiHtml = readFileSync(new URL("../havkar-ai.html", import.meta.url), "utf8");
  assert.ok(/data-tool-button="new_idea"/.test(aiHtml));
  assert.ok(/data-tool-button="ideas"/.test(aiHtml));
  assert.ok(/Business Ideas stays separate from New Idea/.test(aiHtml));
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
  assert.ok(/\/api\/create-event-checkout/.test(jobsHtml));
});

test("global-payments catalog does not swallow jobs_quote actions", () => {
  const api = readFileSync(new URL("../api/create-event-checkout.js", import.meta.url), "utf8");
  assert.ok(/isJobsServicesPaymentAction/.test(api));
  assert.ok(/isGlobalPaymentsRequest\(req\) && !isJobsServicesPaymentAction/.test(api));
});

test("wallet gates Mainnet peer send on payment-status live collection", () => {
  const walletHtml = readFileSync(new URL("../wallet.html", import.meta.url), "utf8");
  assert.ok(/refreshCurrencyRailsHonesty/.test(walletHtml));
  assert.ok(/HAVKAR_XLM_MAINNET_LIVE_COLLECTION/.test(walletHtml));
  assert.ok(/\/api\/payment-status/.test(walletHtml));
});

test("buy-sell surfaces buyer 2% and seller 3% fee honesty", () => {
  const buySellHtml = readFileSync(new URL("../buy-sell.html", import.meta.url), "utf8");
  assert.ok(/Fees &amp; marketplace rules/.test(buySellHtml));
  assert.ok(/buyer fee is <strong>2%<\/strong>/.test(buySellHtml));
  assert.ok(/seller fee is <strong>3%<\/strong>/.test(buySellHtml));
  assert.ok(/havkar-marketplace\.js/.test(buySellHtml));
});

test("i18n21 packs activation phrases for fa/ckb/sv", async () => {
  const vm = await import("node:vm");
  const { createContext, runInContext } = vm;
  const src = readFileSync(new URL("../havkar-ui-i18n21.js", import.meta.url), "utf8");
  const ctx = {};
  createContext(ctx);
  runInContext(src, ctx);
  const api = ctx.HAVKAR_UI_I18N21;
  assert.equal(api.pack("fa")["Choose a travel category"], "یک دستهٔ سفر را انتخاب کنید");
  assert.ok(api.pack("ckb")["Fees & marketplace rules"]);
  assert.equal(api.pack("sv")["Ferries / Ships"], "Färjor / Fartyg");
  assert.equal(api.pack("en")["Choose a travel category"], undefined);
});
