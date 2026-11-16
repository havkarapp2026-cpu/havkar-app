"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");

const root = path.join(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const healthHtml = fs.readFileSync(path.join(root, "health.html"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261115220000_health_platform_foundation.sql"),
  "utf8"
);
const migrationOps = fs.readFileSync(
  path.join(root, "supabase/migrations/20261116010000_health_platform_operations.sql"),
  "utf8"
);
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const health = require(path.join(root, "lib/havkar-health.cjs"));
const healthApi = require(path.join(root, "lib/havkar-health-api.cjs"));
const profile = fs.readFileSync(path.join(root, "profile.html"), "utf8");
const reviews = fs.readFileSync(path.join(root, "reviews.html"), "utf8");
const i18n = fs.readFileSync(path.join(root, "havkar-i18n.js"), "utf8");

const tiles = [...indexHtml.matchAll(/<a class="menu-item"/g)];
assert.equal(tiles.length, 15, "Home must keep exactly 15 tiles");
assert.ok(indexHtml.includes('href="health.html"'));
assert.ok(indexHtml.includes("Doctors &amp; Pharmacies"));
assert.ok(indexHtml.includes("assets/home/doctors-pharmacies.png"));
assert.ok(!indexHtml.includes('href="reviews.html"'), "Reviews tile must leave Home");
assert.ok(profile.includes("reviews.html?mine=1"));
assert.ok(profile.includes("My Reviews"));
assert.ok(profile.includes("Customer Reviews"));
assert.ok(reviews.includes("data-filter=\"mine\"") || reviews.includes("mine=1"));
assert.ok(!/DELETE\s+FROM\s+reviews/i.test(migration));
assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS public.health_providers"));
assert.ok(migration.includes("ENABLE ROW LEVEL SECURITY"));
assert.ok(migration.includes("health_appointments_provider_slot_uidx"));
assert.ok(migrationOps.includes("CREATE TABLE IF NOT EXISTS public.health_availability_slots"));
assert.ok(migrationOps.includes("CREATE TABLE IF NOT EXISTS public.health_messages"));
assert.ok(migrationOps.includes("CREATE TABLE IF NOT EXISTS public.health_reviews"));
assert.ok(migrationOps.includes("Existing legacy public.reviews table is intentionally untouched"));
assert.ok(!/DELETE\s+FROM\s+public\.reviews/i.test(migrationOps));
assert.ok(fs.existsSync(path.join(root, "health-dashboard.html")));
assert.ok(fs.existsSync(path.join(root, "health-herbal.html")));
assert.ok(fs.existsSync(path.join(root, "health-rankings.html")));
assert.ok(!health.healthLiveBillingEnabled({ HAVKAR_HEALTH_LIVE_BILLING_ENABLED: "" }));
assert.ok(!health.healthLiveBillingEnabled({}));
const catalog = health.subscriptionCatalog({});
assert.equal(catalog.patients_platform_fee, "free");
assert.equal(catalog.live_billing_enabled, false);
assert.ok(catalog.plans.every((p) => p.charge_allowed_now === false));
assert.ok(health.HEALTH_CATEGORIES.length >= 25);
assert.ok(health.FREE_UNDER_POLICY.includes("patients"));
assert.ok(health.FREE_UNDER_POLICY.includes("hospital"));
assert.ok(i18n.includes('"Doctors & Pharmacies": "پزشکان و داروخانه‌ها"'));
assert.ok(healthHtml.includes("/api/health"));
assert.ok(healthHtml.includes("havkar-map.js"));
assert.ok(healthHtml.includes("havkar-health-i18n.js"));
assert.ok(fs.existsSync(path.join(root, "havkar-health-i18n.js")));
assert.ok(reviews.includes("HAVKAR_SUPABASE_CONFIG"));
assert.ok(vercel.rewrites.some((r) => r.source === "/api/health"));
const dash = fs.readFileSync(path.join(root, "health-dashboard.html"), "utf8");
assert.ok(dash.includes("havkar-supabase-config.js"));
assert.ok(!dash.includes('src="/supabase-config.js"'));

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(s) {
      this.body = s;
    }
  };
}

async function invoke(action, body) {
  const req = {
    method: "POST",
    url: "/api/health?havkarAction=health",
    query: { action: action },
    body: Object.assign({ action: action }, body || {}),
    headers: {}
  };
  const res = mockRes();
  await healthApi.handler(req, res);
  return { status: res.statusCode, json: JSON.parse(res.body || "{}") };
}

(async () => {
  const status = await invoke("health_catalog");
  assert.equal(status.status, 200);
  assert.equal(status.json.ok, true);
  assert.equal(status.json.patients_platform_fee, "free");
  assert.equal(status.json.live_billing_enabled, false);
  assert.equal(status.json.video_consultations.status, "BLOCKED");
  assert.ok(Array.isArray(status.json.categories));
  assert.ok(status.json.categories.some((c) => c.id === "gp"));
  assert.ok(status.json.categories.some((c) => c.id === "herbal_shop" && c.regulated === false));

  const med = await invoke("health_medicine_search", { q: "paracetamol" });
  assert.equal(med.json.ok, true);
  assert.equal(med.json.sells_medicines, false);
  assert.ok(med.json.results.length >= 1);

  const emptyMed = await invoke("health_medicine_search", { q: "xyz-not-a-real-drug-999" });
  assert.equal(emptyMed.json.ok, true);
  assert.equal(emptyMed.json.results.length, 0);

  const bill = await invoke("health_subscribe_checkout", { plan_id: "health_gp_monthly" });
  assert.equal(bill.status, 403);
  assert.equal(bill.json.charge_allowed_now, false);

  const search = await invoke("health_search", { q: "cardiology", city: "Rome" });
  assert.equal(search.json.ok, true);
  assert.ok(Array.isArray(search.json.results));
  assert.equal(search.json.patients_platform_fee, "free");
  // Never invent providers when DB missing/empty
  assert.ok(search.json.results.every((r) => r && r.id));

  const tele = await invoke("health_telehealth_status");
  assert.equal(tele.json.ok, true);
  assert.equal(tele.json.voice.status, "BLOCKED");
  assert.equal(tele.json.video.status, "BLOCKED");
  assert.equal(tele.json.messaging.status, "available");

  const ranks = await invoke("health_rankings", { level: "global", category_id: "gp" });
  assert.equal(ranks.json.ok, true);
  assert.ok(Array.isArray(ranks.json.results));
  assert.ok(ranks.json.methodology);
  assert.ok(ranks.json.results.every((r) => r.purchased_rank_boost === false));

  const score = healthApi.rankingScore({
    avg_rating: 5,
    review_count: 0,
    license_status: "verified"
  });
  assert.ok(Number.isFinite(score));

  const msgNoConsent = await invoke("health_message_send", {
    provider_id: "00000000-0000-0000-0000-000000000001",
    body: "hello",
    consent_acknowledged: false
  });
  assert.ok(
    ["supabase_config_missing", "consent_required", "missing_bearer_token"].indexOf(
      msgNoConsent.json.error
    ) !== -1
  );

  console.log("HEALTH_PLATFORM_TEST_OK");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
