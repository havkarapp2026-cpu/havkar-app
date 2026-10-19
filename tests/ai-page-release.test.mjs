import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ssePayloads, assistantBlocks } from "../havkar-ai-render.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

const page = read("havkar-ai.html");
const home = read("index.html");
const config = read("havkar-supabase-config.js");
const phrases = read("havkar-ai-phrases.js");

assert.match(page, /\/functions\/v1\/havkar-ai-assistant/);
assert.match(page, /supabase\.auth\.getSession\(\)/);
assert.match(page, /"Authorization": "Bearer " \+ accessToken/);
assert.match(page, /flowType: "pkce"/);
assert.match(page, /autoRefreshToken: true/);
assert.match(page, /havkar-supabase-config\.js/);
assert.match(page, /havkar-ai-render\.mjs/);
assert.match(page, /havkar-ai-phrases\.js/);
assert.match(page, /havkar-i18n\.js/);
assert.doesNotMatch(page, /havkar-ui-dictionary\.js/);
assert.doesNotMatch(page, /havkar-ai-billing/);
assert.doesNotMatch(page, /checkout\.stripe\.com/);
assert.doesNotMatch(page, /billing\.stripe\.com/);
assert.doesNotMatch(page, /stripe/i);
assert.doesNotMatch(page, /ai_subscriptions/);
assert.doesNotMatch(page, /service_role/);
assert.doesNotMatch(page, /HAVKAR_AI_API_KEY/);
assert.match(page, /function billingUnavailable\(\)/);
assert.match(page, /Payment is not active\. These prices are a proposal\./);
assert.match(page, /Paid plans cannot be purchased in this release\./);
assert.match(config, /https:\/\/gispovnciifgikvgpzck\.supabase\.co/);
assert.doesNotMatch(config, /keglioewbkgdabsizvys/);
assert.match(home, /href="havkar-ai\.html"/);
for (const href of [
  "buy-sell.html",
  "jobs.html",
  "services.html",
  "wallet.html",
  "tickets.html",
  "accommodation.html",
  "ads.html",
  "delivery.html",
  "events.html",
  "chat.html",
  "language.html",
  "reviews.html",
  "support.html",
  "admin.html",
  "about.html"
]) {
  assert.match(home, new RegExp("href=\"" + href.replace(".", "\\.") + "\""));
}
assert.doesNotMatch(phrases, /havkar-ai-billing/);
assert.doesNotMatch(phrases, /stripe/i);
assert.equal(ssePayloads('data: {"type":"delta","text":"سلام"}\n', true).payloads[0].text, "سلام");
assert.equal(assistantBlocks("Hello ```js\nconst x = 1;\n```").length, 2);

console.log("AI_PAGE_RELEASE_TEST_OK");
