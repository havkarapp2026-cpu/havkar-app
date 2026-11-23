/**
 * Services final-complete: geo, i18n RTL, owner APIs, €1 prepare math.
 * No live charges.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const geo = require("../lib/services-geo.cjs");
const commerce = require("../havkar-service-commerce.js");

const apiSrc = fs.readFileSync(
  new URL("../api/create-event-checkout.js", import.meta.url),
  "utf8"
);
const webhookSrc = fs.readFileSync(
  new URL("../api/stripe-webhook.js", import.meta.url),
  "utf8"
);
const processorSrc = fs.readFileSync(
  new URL("../lib/stripe-webhook-processor.cjs", import.meta.url),
  "utf8"
);
const servicesHtml = fs.readFileSync(
  new URL("../services.html", import.meta.url),
  "utf8"
);
const adminHtml = fs.readFileSync(
  new URL("../admin.html", import.meta.url),
  "utf8"
);
const i18nSrc = fs.readFileSync(
  new URL("../havkar-services-i18n.js", import.meta.url),
  "utf8"
);
const migrationSrc = fs.readFileSync(
  new URL(
    "../supabase/migrations/20261123050336_services_settlement_statuses.sql",
    import.meta.url
  ),
  "utf8"
);

/* --- API surface --- */
for (const action of [
  "services_geo_search",
  "services_connect_onboard",
  "services_owner_panel",
  "services_category_upsert",
  "services_provider_set_verification",
  "services_complaint_resolve",
  "services_refund_prepare",
  "owner_services_eur1_prepare"
]) {
  assert.match(apiSrc, new RegExp(action));
}

assert.match(apiSrc, /CONNECT_NOT_READY/);
assert.match(apiSrc, /charges_enabled !== true/);
assert.match(apiSrc, /owner_services_eur1_prepare/);
assert.match(apiSrc, /CONFIRM_PHRASE/);
assert.match(apiSrc, /services_destination/);
assert.match(apiSrc, /refund_executed:\s*false/);
assert.match(apiSrc, /completion_pepper_configured/);
assert.match(
  fs.readFileSync(new URL("../lib/owner-eur1-checkout.cjs", import.meta.url), "utf8"),
  /PREPARE_EUR_1_00_LIVE_CHECKOUT/
);
assert.match(
  fs.readFileSync(new URL("../owner-eur1-checkout.html", import.meta.url), "utf8"),
  /owner_services_eur1_prepare/
);

assert.match(webhookSrc, /settleServiceCharge|applyServiceChargeSettlement|havkar_flow.*services/);
assert.match(processorSrc, /services/);
assert.match(migrationSrc, /refunded/);
assert.match(migrationSrc, /disputed/);
assert.match(migrationSrc, /service_settlement_events/);

/* --- UI wiring --- */
assert.match(servicesHtml, /havkar-services-i18n\.js/);
assert.match(servicesHtml, /servicesMapPanel/);
assert.match(servicesHtml, /distanceFilter/);
assert.match(servicesHtml, /servicesConnectBtn/);
assert.match(servicesHtml, /HAVKAR_SERVICES_GEO/);
assert.match(servicesHtml, /haversineKm/);
assert.match(servicesHtml, /services_connect_onboard/);
assert.match(adminHtml, /servicesOpsPanel/);
assert.match(adminHtml, /loadServicesOpsPanel/);
assert.match(adminHtml, /services_owner_panel/);
assert.match(adminHtml, /services_provider_set_verification/);
assert.match(adminHtml, /services_refund_prepare/);

/* --- i18n + RTL --- */
assert.match(i18nSrc, /fa:\s*true/);
assert.match(i18nSrc, /ar:\s*true/);
assert.match(i18nSrc, /ckb:\s*true/);
assert.match(i18nSrc, /\"Available Services\":\s*\"خدمات موجود\"/);
assert.match(i18nSrc, /dir = RTL\[code\] \? \"rtl\" : \"ltr\"/);

/* --- geo math --- */
const d = geo.haversineKm(41.1171, 16.8719, 41.12, 16.88);
assert.ok(d != null && d > 0 && d < 5);
assert.equal(geo.haversineKm(999, 0, 0, 0), null);

const filtered = geo.filterServicesByDistance(
  [
    { id: 1, latitude: 41.1171, longitude: 16.8719, title: "near" },
    { id: 2, latitude: 45.0, longitude: 9.0, title: "far" },
    { id: 3, service_mode: "online", title: "remote" }
  ],
  { latitude: 41.1171, longitude: 16.8719 },
  25
);
assert.equal(filtered.length, 2);
assert.equal(filtered[0].id, 1);
assert.ok(filtered.some((r) => r.id === 3));

const embed = geo.osmEmbedUrl(41.1171, 16.8719);
assert.match(embed, /openstreetmap\.org\/export\/embed\.html/);
assert.match(embed, /marker=/);

/* --- €1 prepare fee math (customer pays list; 10% provider fee) --- */
const eur1 = commerce.settleProviderCommission(100);
assert.equal(eur1.ok, true);
assert.equal(eur1.settlement.customerChargeCents, 100);
assert.equal(eur1.settlement.commissionCents, 10);
assert.equal(eur1.settlement.providerSettlementCents, 90);

console.log("services-final-complete.test.mjs: OK");
console.log(
  JSON.stringify({
    eur1_prepare: {
      list_price_eur: 1,
      customer_pays_eur: 1,
      platform_commission_eur: 0.1,
      provider_settlement_eur: 0.9,
      commission_bps: 1000,
      charged: false,
      note: "prepare-only; Owner must approve before any live checkout"
    }
  })
);
