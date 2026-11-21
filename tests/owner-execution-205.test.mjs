import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function loadBrowser(rel) {
  const code = fs.readFileSync(path.join(root, rel), "utf8");
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

test("payment rails explain health OFF while global collection armed", () => {
  const { buildCurrencyRailsStatus } = require("../lib/payment-currency-rails.cjs");
  const status = buildCurrencyRailsStatus({
    HAVKAR_REAL_PAYMENTS_ENABLED: "true",
    HAVKAR_STRIPE_LIVE_ENABLED: "true",
    STRIPE_SECRET_KEY: "sk_live_dummy",
    HAVKAR_STRIPE_PAYMENTS_ENABLED: "true",
    HAVKAR_HEALTH_LIVE_BILLING_ENABLED: "false",
    HAVKAR_HOTELS_LIVE_BOOKING_ENABLED: "false",
    HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: "true",
    HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION: "true"
  });
  assert.equal(status.honesty.live_payments_paused, false);
  assert.equal(status.module_scopes.health_subscription_billing.effective, "OFF");
  assert.equal(status.module_scopes.health_subscription_billing.charge_allowed_now, false);
  assert.equal(status.gates.HAVKAR_HEALTH_LIVE_BILLING_ENABLED, false);
  assert.match(status.honesty.live_payments_paused_means, /Global Stripe/);
  assert.equal(status.presentment.count, 133);
});

test("external integrations stay blocked without fabricating success", () => {
  const {
    buildExternalIntegrationsStatus
  } = require("../lib/external-integrations-status.cjs");
  const status = buildExternalIntegrationsStatus({});
  assert.equal(status.integrations.omio.live_booking, false);
  assert.equal(status.integrations.telehealth_voice_video.voice, "BLOCKED");
  assert.equal(status.integrations.telehealth_voice_video.video, "BLOCKED");
  assert.equal(status.honesty.never_fabricate_successful_external_transactions, true);
});

test("omio adapter never returns fabricated journeys", async () => {
  const { searchOmioJourneys } = require("../lib/omio-adapter.cjs");
  const out = await searchOmioJourneys({ from: "Rome", to: "Milan" }, {});
  assert.equal(out.ok, false);
  assert.deepEqual(out.results, []);
  assert.equal(out.error, "omio_blocked");
});

test("ui i18n21 includes tickets wallet chat ads events", () => {
  const api = loadBrowser("havkar-ui-i18n21.js").HAVKAR_UI_I18N21;
  const fa = api.pack("fa");
  assert.equal(fa["Awaiting partner access"], "در انتظار دسترسی شریک");
  assert.ok(fa["Connect Stellar Wallet"]);
  assert.ok(fa["Post an ad"]);
  assert.ok(fa["Create event"]);
  assert.ok(fa["Book service"]);
  const ckb = api.pack("ckb");
  const kmr = api.pack("kmr");
  assert.notEqual(ckb["Train"], kmr["Train"]);
});

test("events and accommodation expose advanced map controls", () => {
  const events = fs.readFileSync(path.join(root, "events.html"), "utf8");
  assert.match(events, /eventsBoundsBtn/);
  assert.match(events, /cluster:\s*true/);
  assert.match(events, /filterItemsInBounds/);
  const hotels = fs.readFileSync(path.join(root, "accommodation.html"), "utf8");
  assert.match(hotels, /hotelsBoundsBtn/);
  assert.match(hotels, /markerClusterGroup/);
  assert.match(hotels, /setListingPins/);
  assert.match(hotels, /data-listing-id/);
});

test("home logo and 15 tiles unchanged", () => {
  const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.equal((home.match(/class="menu-item"/g) || []).length, 15);
  assert.match(home, /doctors-pharmacies\.png/);
  assert.match(home, /home-mint-map-bg/);
});
