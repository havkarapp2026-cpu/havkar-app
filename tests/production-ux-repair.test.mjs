import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("home keeps 15 tiles with Calls and reserved Coming soon", () => {
  const index = read("index.html");
  assert.match(index, /href="calls\.html"/);
  assert.match(index, /data-i18n="calls"/);
  assert.match(index, /href="coming-soon\.html"/);
  assert.match(index, /data-i18n="comingSoon"/);
  assert.doesNotMatch(index, /href="support\.html"/);
  assert.doesNotMatch(index, /href="about\.html"/);
  const tiles = index.match(/class="menu-item"/g) || [];
  assert.equal(tiles.length, 15);
  assert.ok(fs.existsSync(path.join(root, "assets/home/calls.png")));
  assert.ok(fs.existsSync(path.join(root, "assets/home/coming-soon.png")));
  assert.ok(fs.existsSync(path.join(root, "calls.html")));
});

test("calls page stays gated without fake working call buttons", () => {
  const page = read("calls.html");
  assert.match(page, /disabled/);
  assert.match(page, /BLOCKED/);
  assert.doesNotMatch(page, /startCall\(/);
});

test("jobs post modal sits above maps and suppresses map while open", () => {
  const jobs = read("jobs.html");
  assert.match(jobs, /z-index:5000/);
  assert.match(jobs, /suppressAllMaps\(true\)/);
  assert.match(jobs, /id="jobCountry"/);
  assert.match(jobs, /id="jobCity"/);
  assert.match(jobs, /havkar-map-platform\.css/);
});

test("shared map platform exposes street/satellite/hybrid and share helpers", () => {
  const map = read("havkar-map.js");
  assert.match(map, /setBaseLayer/);
  assert.match(map, /World_Imagery/);
  assert.match(map, /nativeShareLocation/);
  assert.match(map, /trafficCamerasStatus/);
  const panel = read("havkar-module-map.js");
  assert.match(panel, /Street map/);
  assert.match(panel, /Satellite/);
  assert.match(panel, /Share location/);
  assert.match(panel, /suppressAllMaps/);
  assert.ok(fs.existsSync(path.join(root, "havkar-map-platform.css")));
});

test("chat preserves original message text and stores translation separately", () => {
  const chat = read("chat.html");
  assert.match(chat, /Always persist the original/);
  assert.match(chat, /p_translated_text/);
  assert.match(chat, /translated_text/);
  assert.match(chat, /message-translation/);
  const migration = read(
    "supabase/migrations/20261117140000_chat_message_translation_preserve.sql"
  );
  assert.match(migration, /translated_text/);
  assert.match(migration, /p_translated_text/);
});

test("partita IVA published and Support/About remain reachable from profile", () => {
  const op = read("havkar-operator-config.js");
  assert.match(op, /partitaIva:\s*"04086440791"/);
  const profile = read("profile.html");
  assert.match(profile, /goTo\('support\.html'\)/);
  assert.match(profile, /openAbout\(\)/);
  assert.match(profile, /My listings/);
  const support = read("support.html");
  assert.match(support, /04086440791/);
  assert.match(support, /max-width:960px/);
});

test("tickets are travel-first and hide partner secret names from users", () => {
  const tickets = read("tickets.html");
  assert.match(tickets, /Travel Tickets/);
  assert.match(tickets, /data-ticket-type="flight"[^>]*aria-pressed="true"/);
  assert.match(
    tickets,
    /Travel search is temporarily unavailable for this mode/
  );
  assert.doesNotMatch(tickets, /missing_OMIO_AFFILIATE_ID/);
  assert.doesNotMatch(tickets, /OMIO_API_KEY/);
});

test("hotels public UI does not dump raw quote JSON", () => {
  const page = read("accommodation.html");
  assert.match(page, /Never dump raw API JSON/);
  assert.doesNotMatch(
    page,
    /payQuoteRaw\.textContent = JSON\.stringify\(body, null, 2\)/
  );
});

test("future messenger integration doc exists and is preparation-only", () => {
  const doc = read("docs/future-messenger-integration.md");
  assert.match(doc, /preparation only/i);
  assert.match(doc, /Stable identity/);
  assert.match(doc, /does \*\*not\*\* ship/);
});

test("profile About opens canonical about.html and delivery map is inside the request form", () => {
  const profile = read("profile.html");
  assert.match(profile, /goTo\("about\.html"\)/);
  const delivery = read("delivery.html");
  const formOpen = delivery.indexOf('id="deliveryForm"');
  const formClose = delivery.indexOf("</form>", formOpen);
  const mapIdx = delivery.indexOf('id="moduleMapPanel"');
  assert.ok(formOpen > 0 && mapIdx > formOpen && mapIdx < formClose);
  assert.match(delivery, /id="applyMapToPickup"/);
  assert.match(delivery, /z-index:\s*5000/);
});
