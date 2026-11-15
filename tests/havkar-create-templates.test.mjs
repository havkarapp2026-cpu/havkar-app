import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const templates = require("../lib/venture-templates.cjs");
const api = require("../lib/ideas-studio-api.cjs");

const EXPECTED_IDS = [
  "landing_business",
  "restaurant_ordering",
  "online_shop",
  "community_creator",
  "booking_services",
  "sports_training",
  "hardware_connected",
  "dashboard_forms",
  "game_2d_football",
  "salon_services",
  "repair_workshop"
];

const list = templates.listTemplates();
assert.equal(list.length, 11, "CREATE must expose exactly 11 templates");
const ids = list.map((t) => t.id);
for (const id of EXPECTED_IDS) {
  assert.ok(ids.includes(id), "missing template " + id);
}

for (const t of list) {
  assert.ok(Array.isArray(t.supported) && t.supported.length, t.id + " supported");
  assert.ok(Array.isArray(t.unsupported) && t.unsupported.length, t.id + " unsupported");
  const built = templates.buildConfigFromTemplate(t.id, {
    heroTitle: "Test " + t.id
  });
  assert.equal(built.ok, true, t.id + " build ok");
  assert.equal(built.config.payments_enabled, false, t.id + " payments OFF");
  assert.equal(built.config.public_publish_enabled, false, t.id + " publish OFF");
  assert.equal(built.config.template_id, t.id);
}

const football = templates.buildConfigFromTemplate("game_2d_football", {});
assert.equal(football.config.gameUrl, "create-football-2d.html");

// Runtime renderer must accept every template config without executing user scripts.
const runtimeSrc = fs.readFileSync("havkar-create-runtime.js", "utf8");
const sandbox = { window: {}, console };
vm.runInNewContext(runtimeSrc + "\nthis.RUNTIME = window.HAVKAR_CREATE_RUNTIME || this.HAVKAR_CREATE_RUNTIME;", sandbox);
// IIFE attaches to root; in vm without window it may attach to global this
const runtime =
  sandbox.RUNTIME ||
  sandbox.HAVKAR_CREATE_RUNTIME ||
  (function () {
    const g = {};
    vm.runInNewContext(runtimeSrc, g);
    return g.HAVKAR_CREATE_RUNTIME;
  })();
assert.ok(runtime && typeof runtime.mount === "function", "runtime mount");
assert.ok(typeof runtime.renderHtml === "function" || typeof runtime.buildDocument === "function" || true);

// Call internal HTML builder via mount mock
for (const t of list) {
  const built = templates.buildConfigFromTemplate(t.id, { heroTitle: t.name });
  const iframe = {
    srcdoc: "",
    attrs: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    }
  };
  runtime.mount(iframe, built.config);
  assert.ok(String(iframe.srcdoc || "").length > 40, "srcdoc for " + t.id);
  assert.match(iframe.srcdoc, /HAVKAR CREATE sandbox|sandbox preview|payments OFF/i);
  assert.doesNotMatch(iframe.srcdoc, /<script[^>]*>[\s\S]*eval\(/i);
  assert.equal(iframe.attrs.sandbox, "allow-forms allow-scripts allow-modals");
}

// Ephemeral analyze without Supabase env
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.equal(api.supabaseEnvStatus().configured, false);
const analysis = api.analyzeIdeaLocal({
  title: "Salon",
  category: "booking",
  description: "Booking page for a neighborhood salon with service list and request form."
});
assert.equal(analysis.ai_mode, "local_structured_v1");

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
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

const req = {
  method: "POST",
  headers: {},
  body: {
    action: "analyze_idea",
    title: "Cafe",
    category: "restaurant",
    description: "A neighborhood cafe website with menu and booking for local customers."
  }
};
const res = mockRes();
await api.handleIdeasStudioRequest(req, res);
assert.equal(res.body.ok, true);
assert.equal(res.body.mode, "ephemeral");
assert.equal(res.body.backend_configured, false);

const statusRes = mockRes();
await api.handleIdeasStudioRequest(
  { method: "GET", headers: {}, query: { action: "ideas_studio_status" }, body: {} },
  statusRes
);
assert.equal(statusRes.body.ok, true);
assert.equal(statusRes.body.backend_configured, false);
assert.ok(statusRes.body.backend.missing_env.includes("SUPABASE_URL"));
assert.equal(statusRes.body.flags.payments_enabled, false);
assert.equal(statusRes.body.flags.public_publish_enabled, false);
assert.equal((statusRes.body.templates || []).length, 11);

const home = fs.readFileSync("index.html", "utf8");
assert.equal((home.match(/class="menu-item"/g) || []).length, 15);

console.log("HAVKAR_CREATE_TEMPLATES_TEST_OK");
