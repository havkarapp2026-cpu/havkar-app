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
assert.match(ai, /data-create-entry="persistent"/);
assert.match(ai, /data-create-entry="nav"/);
assert.match(ai, /create-persistent/);
assert.match(ai, /Persistent CREATE entry/);
const hideBlock = ai.match(
  /body\.chat-active:not\(\.intro-open\)[\s\S]{0,280}?\.tips \{ display: none !important; \}/
);
assert.ok(hideBlock, "chat-active hide rule present");
assert.doesNotMatch(hideBlock[0], /create-persistent/);

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
assert.equal(typeof api.analyzeIdeaLocal, "function");
assert.equal(typeof api.supabaseEnvStatus, "function");
assert.equal(typeof api.handleIdeasStudioRequest, "function");

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.equal(api.supabaseEnvStatus().configured, false);

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader() {},
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    end(s) {
      if (s) this.body = JSON.parse(s);
    }
  };
}
const analyzeRes = mockRes();
await api.handleIdeasStudioRequest(
  {
    method: "POST",
    headers: {},
    body: {
      action: "analyze_idea",
      title: "Demo",
      category: "website",
      description: "Ephemeral CREATE analysis without Supabase service role configured."
    }
  },
  analyzeRes
);
assert.equal(analyzeRes.body.ok, true);
assert.equal(analyzeRes.body.mode, "ephemeral");

// save_idea must fail closed when Supabase service env is absent (no fake keys).
const saveRes = mockRes();
await api.handleIdeasStudioRequest(
  {
    method: "POST",
    headers: {},
    body: {
      action: "save_idea",
      title: "Blocked save",
      category: "website",
      description: "This save must not succeed without SUPABASE_URL and SERVICE_ROLE."
    }
  },
  saveRes
);
assert.equal(saveRes.body.ok, false);
assert.match(String(saveRes.body.error || ""), /not configured/i);
assert.deepEqual(saveRes.body.missing_env, [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
]);

console.log("HAVKAR_CREATE_TEST_OK");
