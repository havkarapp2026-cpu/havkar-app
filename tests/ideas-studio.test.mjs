import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const api = require("../lib/ideas-studio-api.cjs");
const templates = require("../lib/venture-templates.cjs");

assert.equal(api.FLAGS.payments_enabled, false);
assert.equal(api.FLAGS.public_publish_enabled, false);
assert.equal(api.FLAGS.ownership_transfer_enabled, false);
assert.equal(api.FLAGS.agreement_payouts_enabled, false);
assert.equal(api.FLAGS.proposed_default_split.havkar_bps, 7000);
assert.equal(api.FLAGS.proposed_default_split.partner_bps, 3000);

const list = templates.listTemplates();
assert.ok(list.length >= 7);
assert.ok(list.every((t) => Array.isArray(t.unsupported) && t.unsupported.length));

const built = templates.buildConfigFromTemplate("landing_business", {
  heroTitle: "Demo"
});
assert.equal(built.ok, true);
assert.equal(built.config.payments_enabled, false);
assert.equal(built.config.public_publish_enabled, false);

const summary = api.computeNetProfit([
  { entry_type: "gross_revenue", amount_cents: 10000 },
  { entry_type: "eligible_expense", amount_cents: 2000 }
]);
assert.equal(summary.gross_cents, 10000);
assert.equal(summary.eligible_expenses_cents, 2000);
assert.equal(summary.net_profit_cents, 8000);
assert.equal(summary.proposed_havkar_cents, 5600);
assert.equal(summary.proposed_partner_cents, 2400);
assert.equal(summary.payouts_enabled, false);
assert.equal(summary.simulated, true);

const migration = fs.readFileSync(
  "supabase/migrations/20261114180000_ideas_studio_ecosystem.sql",
  "utf8"
);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /payments_enabled = false/);
assert.match(migration, /public_publish_enabled = false/);
assert.match(migration, /payouts_enabled = false/);
assert.match(migration, /force_newtons/);
assert.match(migration, /aldo_training_sessions/);

const home = fs.readFileSync("index.html", "utf8");
const tiles = home.match(/class="menu-item"/g) || [];
assert.equal(tiles.length, 15);
assert.doesNotMatch(home, /ideas-studio\.html/);

const ai = fs.readFileSync("havkar-ai.html", "utf8");
assert.match(ai, /ideas-studio\.html/);
assert.match(ai, /Ideas Portal &amp; HAVKAR Studio|Ideas &amp; Studio/);

const profile = fs.readFileSync("profile.html", "utf8");
assert.match(profile, /ideas-studio\.html/);

const page = fs.readFileSync("ideas-studio.html", "utf8");
assert.match(page, /Payments OFF/);
assert.match(page, /TEST\/SIMULATION|simulation/i);
assert.match(page, /havkar-ideas-studio\.js/);

const client = fs.readFileSync("havkar-ideas-studio.js", "utf8");
assert.match(client, /\/api\/ideas-studio/);
assert.match(client, /measured_force/);

assert.ok(fs.existsSync("api/ideas-studio.js"));
assert.ok(fs.existsSync("docs/ideas-studio/LEGAL_CHECKLIST.md"));
assert.ok(fs.existsSync("docs/ideas-studio/ALDO_HARDWARE_SENSOR_CONTRACT.md"));

console.log("IDEAS_STUDIO_TEST_OK");
