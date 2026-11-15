import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const api = require("../lib/ideas-studio-api.cjs");
const templates = require("../lib/venture-templates.cjs");
const billing = require("../lib/havkar-create-billing.cjs");

assert.equal(api.FLAGS.payments_enabled, false);
assert.equal(api.FLAGS.public_publish_enabled, false);
assert.equal(billing.CREATE_BILLING_POLICY.live_charges_enabled, false);
assert.equal(billing.CREATE_BILLING_POLICY.draft_rates_pending_owner_approval, true);
assert.equal(billing.CREATE_BILLING_POLICY.marketplace_fees_untouched, true);
assert.equal(billing.CREATE_BILLING_POLICY.idea_registration.amount_eur, 0);

const quote = billing.quoteCreateUsage([
  { sku: "ai_analysis", qty: 2 },
  { sku: "preview_build", qty: 1 },
  { sku: "sandbox_runtime_hour", qty: 1 }
]);
assert.equal(quote.ok, true);
assert.equal(quote.live_charges_enabled, false);
assert.equal(quote.total_cents_draft, 50 * 2 + 5 + 8);
assert.equal(billing.quoteCreateUsage([{ sku: "unknown_sku", qty: 1 }]).ok, false);

const list = templates.listTemplates();
assert.ok(list.length >= 10);
const ids = list.map((t) => t.id);
assert.ok(ids.includes("game_2d_football"));
assert.ok(ids.includes("salon_services"));
assert.ok(ids.includes("repair_workshop"));

const football = templates.buildConfigFromTemplate("game_2d_football", {});
assert.equal(football.ok, true);
assert.equal(football.config.gameUrl, "create-football-2d.html");
assert.equal(football.config.payments_enabled, false);

const home = fs.readFileSync("index.html", "utf8");
const tiles = home.match(/class="menu-item"/g) || [];
assert.equal(tiles.length, 15);
assert.doesNotMatch(home, /ideas-studio\.html/);
assert.match(home, /havkar-ai\.html/);

const ai = fs.readFileSync("havkar-ai.html", "utf8");
assert.match(ai, /ideas-studio\.html/);
assert.match(ai, /HAVKAR CREATE/);

const profile = fs.readFileSync("profile.html", "utf8");
assert.match(profile, /ideas-studio\.html/);
assert.match(profile, /HAVKAR CREATE/);

const page = fs.readFileSync("ideas-studio.html", "utf8");
assert.match(page, /HAVKAR CREATE/);
assert.match(page, /havkar-create-runtime\.js/);
assert.match(page, /createSandbox/);
assert.match(page, /analyzeIdeaBtn/);
assert.match(page, /billingQuoteBtn/);
assert.match(page, /marketplacePrepareBtn/);
assert.match(page, /create-football-2d\.html/);

const client = fs.readFileSync("havkar-ideas-studio.js", "utf8");
assert.match(client, /analyze_idea/);
assert.match(client, /billing_quote/);
assert.match(client, /marketplace_prepare/);
assert.match(client, /HAVKAR_CREATE_RUNTIME/);

const runtime = fs.readFileSync("havkar-create-runtime.js", "utf8");
assert.match(runtime, /does not execute user-supplied scripts/i);
assert.match(runtime, /srcdoc/);

const footballPage = fs.readFileSync("create-football-2d.html", "utf8");
assert.match(footballPage, /NOT the Aldo/);
assert.match(footballPage, /canvas/);
assert.match(footballPage, /Start \/ Restart/);

const eur = fs.readFileSync("api/eur-usd-quote.js", "utf8");
assert.match(eur, /analyze_idea/);
assert.match(eur, /billing_quote/);
assert.match(eur, /marketplace_prepare/);

assert.ok(fs.existsSync("docs/ideas-studio/HAVKAR_CREATE_AUDIT.md"));
assert.ok(typeof api.analyzeIdeaLocal === "function" || typeof api.handleIdeasStudioRequest === "function");

console.log("HAVKAR_CREATE_TEST_OK");
