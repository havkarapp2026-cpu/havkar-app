/**
 * Owner mandate: Settings hub categories + featured Language/Support/About.
 * Role-gated admin/staff preserved; no payment/Stripe changes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const profile = fs.readFileSync("profile.html", "utf8");
const settingsRedirect = fs.readFileSync("settings.html", "utf8");

test("settings.html still redirects to profile hub", () => {
  assert.match(settingsRedirect, /profile\.html/);
});

test("settings hub uses deep HAVKAR green theme", () => {
  assert.match(profile, /content="#1b5e20"/);
  assert.match(profile, /--havkar-green:#1b5e20/);
  assert.match(profile, /hub-featured/);
  assert.match(profile, /filterSettingsHub/);
});

test("featured Language Support About link to existing pages", () => {
  assert.match(profile, /goTo\('language\.html'\)/);
  assert.match(profile, /goTo\('support\.html'\)/);
  assert.match(profile, /goTo\('about\.html'\)/);
  assert.equal(fs.existsSync("language.html"), true);
  assert.equal(fs.existsSync("support.html"), true);
  assert.equal(fs.existsSync("about.html"), true);
});

test("hub categories and logout preserved", () => {
  for (const cat of [
    "identity",
    "personalize",
    "activity",
    "finance",
    "security",
    "support-about",
    "admin",
    "logout"
  ]) {
    assert.match(profile, new RegExp(`data-hub-category="${cat}"`));
  }
  assert.match(profile, /onclick="logout\(\)"/);
});

test("staff and administration remain role-gated", () => {
  assert.match(profile, /id="profileStaffWorkspace"/);
  assert.match(profile, /id="profileAdministration"/);
  assert.match(profile, /havkar_session_role/);
  assert.match(profile, /dataset\.roleAllowed/);
});

test("guest login area exposes language support about", () => {
  const login = profile.match(/id="loginArea"[\s\S]*?<\/div>\s*<\/div>\s*<\/main>/);
  assert.ok(login);
  assert.match(login[0], /language\.html/);
  assert.match(login[0], /support\.html/);
  assert.match(login[0], /about\.html/);
});

test("wallet history and market shortcuts remain", () => {
  assert.match(profile, /goTo\('wallet\.html'\)/);
  assert.match(profile, /goTo\('history\.html'\)/);
  assert.match(profile, /goTo\('market\.html'\)/);
});
