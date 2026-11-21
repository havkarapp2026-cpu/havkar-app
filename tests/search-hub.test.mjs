import assert from "node:assert/strict";
import fs from "node:fs";

const search = fs.readFileSync("search.html", "utf8");
assert.match(search, /id="q"/);
assert.match(search, /buy-sell\.html\?q=/);
assert.match(search, /services\.html\?q=/);
assert.match(search, /jobs\.html\?q=/);
assert.match(search, /ads\.html\?q=/);
assert.match(search, /events\.html\?q=/);
assert.match(search, /HAVKAR_SEARCH_UI/);
assert.match(search, /20261121-search-live-v1/);
assert.match(search, /havkar-i18n\.js/);
assert.match(search, /havkar-marketplace\.js/);
assert.match(search, /from\("ads"\)/);
assert.match(search, /from\("services"\)/);
assert.match(search, /from\("jobs"\)/);
assert.match(search, /from\("events"\)/);
assert.match(search, /This page never invents results/);
assert.match(search, /data-scope="all"/);
assert.doesNotMatch(search, /fakeResults|mockResults|demoResults|lorem ipsum/i);

for (const file of ["buy-sell.html", "services.html", "jobs.html", "ads.html", "events.html"]) {
  const body = fs.readFileSync(file, "utf8");
  assert.match(body, /get\(["']q["']\)/, file + " must read ?q=");
}

const profile = fs.readFileSync("profile.html", "utf8");
assert.match(profile, /openBlockedUsers/);
assert.match(profile, /user_blocks/);
assert.doesNotMatch(profile, /display:\s*none[^"]*"settingsBlockedUsers/);

const chat = fs.readFileSync("chat.html", "utf8");
assert.match(chat, /blockUserButton/);
assert.match(chat, /user_blocks/);

const migration = fs.readFileSync(
  "supabase/migrations/20261110183000_user_blocks_and_event_interest_anon_revoke.sql",
  "utf8"
);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.user_blocks/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /event_interest_counts/);

console.log("SEARCH_HUB_TEST_OK");
