import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

const home = read("index.html");
const profile = read("profile.html");
const assistant = read("havkar-ai.html");
const admin = read("admin.html");

const tiles = [...home.matchAll(/<a class="menu-item" href="([^"]+)"/g)].map((match) => match[1]);

assert.deepEqual(tiles, [
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
  "havkar-ai.html",
  "about.html"
]);

assert.equal(tiles.length, 15);
assert.match(home, /assets\/home\/header\.png/);
assert.match(home, /assets\/home\/languages\.png/);
assert.match(home, /assets\/home\/havkar-ai\.png/);
assert.match(home, /assets\/home\/about\.png/);
for (const name of [
  "header.png", "buy-sell.png", "jobs.png", "services.png", "wallet.png",
  "tickets.png", "accommodation.png", "ads.png", "delivery.png", "events.png",
  "chat.png", "languages.png", "reviews.png", "support.png", "havkar-ai.png", "about.png"
]) {
  assert.ok(fs.existsSync(path.join(root, "assets/home", name)), name);
}
assert.match(home, /class="language-latin">A</);
assert.match(home, /class="language-kurdish">س</);
assert.match(home, /class="language-east">あ</);
assert.match(home, /class="visually-hidden language-mark" translate="no" data-i18n-ignore/);
assert.match(home, /\.menu-item \.language-latin[\s\S]*font-size:\s*1\.45rem/);
assert.match(home, /\.menu-item \.language-kurdish[\s\S]*font-size:\s*\.92rem/);
assert.match(home, /\.menu-item \.language-east[\s\S]*font-size:\s*\.68rem/);
assert.match(home, /\.menu-item \.tile-label[\s\S]*text-align:\s*center/);
assert.doesNotMatch(home, /\.menu-grid[\s\S]{0,180}direction:\s*ltr/);
assert.doesNotMatch(home, /<a class="menu-item"[^>]*aria-label=/);

const labels = [...home.matchAll(/<span class="tile-label"(?: data-i18n="([^"]*)")?>([^<]*)<\/span>/g)];
assert.deepEqual(labels.map((match) => match[2]), [
  "Buy &amp; Sell",
  "Jobs",
  "Services",
  "Wallet",
  "Tickets",
  "Accommodation",
  "Ads",
  "Delivery",
  "Events",
  "Chat",
  "Languages",
  "Reviews",
  "Support",
  "HAVKAR AI",
  "About HAVKAR"
]);
assert.equal(labels.length, tiles.length);
assert.doesNotMatch(home, /href="admin\.html"/);
assert.doesNotMatch(home, /id="signedInPanel"|id="signedInEmail"|id="homeLogout"/);
assert.match(home, /id="guestSignup"/);
assert.match(home, /id="guestLogin"/);
assert.match(home, /supabase\.auth\.getSession/);

assert.match(profile, /id="profileAdministration"/);
assert.match(profile, /id="profileAdministration"[\s\S]*hidden/);
assert.match(profile, /havkar_session_is_admin/);
assert.match(profile, /havkar_session_is_owner/);
assert.match(profile, /id="userEmail"/);
assert.match(profile, /onclick="logout\(\)"/);
assert.match(profile, /button\.hidden = !\(\s*adminAllowed\s*\|\|\s*ownerAllowed\s*\)/);

assert.match(admin, /havkar_session_is_admin/);
assert.match(admin, /havkar_session_is_owner/);
assert.match(admin, /admin\.data !== true/);
assert.match(admin, /Owner access is active\. Administrator records stay separate\./);
assert.ok(
  admin.indexOf("Owner access is active") < admin.indexOf("service_commission_entries")
);

assert.match(assistant, /\/functions\/v1\/havkar-ai-assistant/);
assert.match(assistant, /supabase\.auth\.getSession/);
assert.doesNotMatch(assistant, /HAVKAR_AI_API_KEY/);
assert.doesNotMatch(assistant, /service_role/);

const apiFiles = fs.readdirSync(path.join(root, "api")).filter((name) => name.endsWith(".js") || name.endsWith(".mjs"));
assert.equal(apiFiles.length, 11);
assert.ok(apiFiles.length <= 12);

console.log("HOME_DESIGN_TEST_OK");
