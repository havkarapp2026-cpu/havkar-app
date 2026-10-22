const assert = require("assert");
const fs = require("fs");
const path = require("path");
const widget = require("../havkar-transfer-widget.js");
const handler = require("../api/translate.js");

assert.strictEqual(widget.partnerLocale("de"), "de");
assert.strictEqual(widget.partnerLocale("fa"), "en");
assert.strictEqual(widget.partnerLocale("ckb"), "en");
assert.strictEqual(widget.partnerLocale("kmr"), "en");
assert.strictEqual(widget.widgetShouldUseHavkarTranslation("ckb"), true);
assert.strictEqual(widget.widgetShouldUseHavkarTranslation("kmr"), true);
assert.strictEqual(widget.widgetShouldUseHavkarTranslation("ar"), false);
assert.strictEqual(widget.bookingUrl("fr"), "https://www.book-online-transfers.com/fr/havkar");
assert.strictEqual(widget.bookingUrl("ckb"), "https://www.book-online-transfers.com/en/havkar");
assert.strictEqual(widget.applyProps({ partner_id: "119472" }, "kmr").locale, "en");
assert.strictEqual(widget.applyProps({ partner_id: "119472" }, "it").locale, "it");

assert.strictEqual(handler.googleLanguageCode("kmr"), "ku");
assert.strictEqual(handler.googleLanguageCode("ckb"), "ckb");
assert.strictEqual(handler.googleLanguageCode("ku"), "ku");
assert.strictEqual(handler.googleLanguageCode("fa"), "fa");

const tickets = fs.readFileSync(path.join(__dirname, "../tickets.html"), "utf8");
const typeOrder = [...tickets.matchAll(/data-ticket-type="([^"]+)"/g)].map(match => match[1]);
assert.deepStrictEqual(typeOrder.slice(0, 7), [
    "flight",
    "train",
    "bus",
    "ferry",
    "taxi",
    "transfer",
    "hotel"
]);
assert.ok(tickets.includes("Airport Transfer"));
assert.ok(tickets.includes("Train Station Transfer"));
assert.ok(tickets.includes("Hotel Transfer"));
assert.ok(tickets.includes("City-to-City Transfer"));
assert.ok(tickets.includes("Scheduled Transfer"));
assert.ok(!tickets.includes("Duffel"));
assert.ok(!tickets.includes("createTestOrder"));
assert.ok(!tickets.includes("welcomepickups.com/widget/bundle.js"));
assert.ok(tickets.includes("Welcome Pickups does not allow this site to load its city list."));
assert.ok(!tickets.includes("Open transfer booking"));
const taxi = fs.readFileSync(path.join(__dirname, "../taxi.html"), "utf8");
assert.ok(!taxi.includes("welcomepickups.com/widget/bundle.js"));
assert.ok(taxi.includes("Welcome Pickups does not allow HAVKAR to load its city list."));
assert.ok(!taxi.includes("powered by Welcome Pickups"));
assert.ok(taxi.includes("Taxi booking is not available on this page"));
assert.ok(!tickets.includes("arranged with Welcome Pickups"));
assert.ok(!tickets.includes("Continue to Hotel Transfer"));
assert.ok(tickets.includes("Hotel transfer is unavailable"));

const events = fs.readFileSync(path.join(__dirname, "../events.html"), "utf8");
assert.ok(events.includes(".favorite-btn:not(.active) i"));
assert.ok(events.includes("background: transparent;"));
assert.ok(!events.includes("rgba(255,255,255,.94)"));
assert.ok(events.includes("toggleFavorite"));

const i18n = fs.readFileSync(path.join(__dirname, "../havkar-i18n.js"), "utf8");
assert.ok(i18n.includes("data-havkar-translate-widget"));
assert.ok(i18n.includes('code: "ckb"'));
assert.ok(i18n.includes('code: "kmr"'));

console.log("TRANSFER_WIDGET_TEST_OK");
