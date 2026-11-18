import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("home bottom row is Coming soon | HAVKAR AI | Calls with unavailable badge", () => {
  const home = read("index.html");
  const block = home.match(/class="menu-grid"([\s\S]*?)<\/nav>/)[1];
  const hrefs = [...block.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(hrefs.length, 15);
  assert.deepEqual(hrefs.slice(-3), [
    "coming-soon.html",
    "havkar-ai.html",
    "calls.html"
  ]);
  assert.match(home, /Unavailable/);
  assert.doesNotMatch(block, /href="support\.html"/);
  assert.doesNotMatch(block, /href="about\.html"/);
});

test("core modules do not expose Profile bottom-nav items", () => {
  for (const file of [
    "buy-sell.html",
    "jobs.html",
    "services.html",
    "ads.html",
    "tickets.html",
    "delivery.html",
    "calls.html"
  ]) {
    const html = read(file);
    assert.doesNotMatch(html, /id="navProfile"/);
    assert.doesNotMatch(
      html,
      /class="[^"]*nav-item[^"]*"[\s\S]{0,180}>\s*Profile\s*</
    );
  }
  // Central profile page itself may label the active Profile tab.
  assert.match(read("profile.html"), /Profile/);
});

test("tickets exposes a visible travel map host", () => {
  const tickets = read("tickets.html");
  assert.match(tickets, /id="travelMapPanel"/);
  assert.match(tickets, /id="ticketsMapHost"/);
  assert.match(tickets, /ticketsLayerMenuHost/);
  assert.match(tickets, /havkar-map-live-layers\.js/);
  assert.match(tickets, /zoom:\s*11/);
  assert.match(tickets, /__havkarTicketsDrawRoute/);
  assert.match(tickets, /havkar-map\.js/);
});

test("jobs workplace map uses a separate picker modal", () => {
  const jobs = read("jobs.html");
  assert.match(jobs, /id="jobLocationModal"/);
  assert.match(jobs, /openJobLocationPicker/);
  assert.match(jobs, /display = "none"/);
  assert.match(jobs, /z-index:5000/);
});

test("map defaults avoid blue-ocean low zoom and support hybrid layers", () => {
  const panel = read("havkar-module-map.js");
  assert.match(panel, /zoom: opts\.zoom \|\| 11/);
  const map = read("havkar-map.js");
  assert.match(map, /setBaseLayer/);
  assert.match(map, /World_Imagery/);
  assert.match(map, /tile\.openstreetmap\.org/);
  assert.match(map, /World_Imagery/);
});

test("post-ad and services mount 133-currency selector", () => {
  const post = read("post-ad.html");
  assert.match(post, /havkar-currency-select\.js/);
  assert.match(post, /currencySelectMount/);
  assert.doesNotMatch(post, /<select id="currency"[\s\S]*?<option value="EUR">/);
  const services = read("services.html");
  assert.match(services, /editServiceCurrencyMount/);
  assert.match(services, /havkar-currency-select\.js/);
});

test("about publishes Visura ATECO without public Owner email", () => {
  const about = read("about.html");
  assert.match(about, /04086440791/);
  assert.match(about, /KR-234170/);
  assert.match(about, /03\/11\/2026/);
  assert.match(about, /63\.91\.00/);
  assert.match(about, /47\.91\.10/);
  assert.match(about, /info@havkar\.online/);
  assert.match(about, /support@havkar\.online/);
  assert.doesNotMatch(about, /soran@havkar\.online/);
  assert.match(about, /havkar\.online/);
});

test("jobs post form mounts currency selector and chat preserves plaintext bidi", () => {
  const jobs = read("jobs.html");
  assert.match(jobs, /jobCurrencyMount/);
  assert.match(jobs, /havkar-currency-select\.js/);
  const chat = read("chat.html");
  assert.match(chat, /unicode-bidi:\s*plaintext/);
  assert.match(chat, /havkarTextDir/);
  assert.match(chat, /message_text/);
  assert.match(chat, /translated_text/);
});
