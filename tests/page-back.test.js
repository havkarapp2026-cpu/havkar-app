const assert = require("assert");
const back = require("../havkar-page-back.js");

const origin = "https://havkar-app.vercel.app";

const direct = back.havkarBackDestination(
    origin + "/tickets.html",
    ""
);
assert.strictEqual(direct.action, "assign");
assert.strictEqual(direct.href, "index.html");

const fromHome = back.havkarBackDestination(
    origin + "/tickets.html",
    origin + "/index.html"
);
assert.strictEqual(fromHome.action, "history");
assert.strictEqual(fromHome.href, "index.html");

const fromLogin = back.havkarBackDestination(
    origin + "/index.html",
    origin + "/login.html"
);
assert.strictEqual(fromLogin.action, "assign");
assert.strictEqual(fromLogin.href, "index.html");

const fromLanguageEntry = back.havkarBackDestination(
    origin + "/index.html",
    origin + "/language.html?entry=1"
);
assert.strictEqual(fromLanguageEntry.action, "assign");
assert.strictEqual(fromLanguageEntry.href, "index.html");

const fromLanguageSettings = back.havkarBackDestination(
    origin + "/language.html",
    origin + "/profile.html",
    "profile.html"
);
assert.strictEqual(fromLanguageSettings.action, "history");

const samePage = back.havkarBackDestination(
    origin + "/tickets.html?lang=fa",
    origin + "/tickets.html"
);
assert.strictEqual(samePage.action, "assign");
assert.strictEqual(samePage.href, "index.html");

const directHistory = back.havkarBackDestination(
    origin + "/history.html",
    "",
    "wallet.html"
);
assert.strictEqual(directHistory.action, "assign");
assert.strictEqual(directHistory.href, "wallet.html");

const external = back.havkarBackDestination(
    origin + "/events.html",
    "https://example.com/events.html"
);
assert.strictEqual(external.action, "assign");
assert.strictEqual(external.href, "index.html");

const blockedParent = back.havkarBackDestination(
    origin + "/profile.html",
    "",
    "login.html"
);
assert.strictEqual(blockedParent.href, "index.html");

const entryBack = back.havkarBackDestination(
    origin + "/language.html?entry=1",
    origin + "/index.html",
    "profile.html"
);
assert.strictEqual(entryBack.action, "assign");
assert.strictEqual(entryBack.href, "index.html");

const entryFromVercel = back.havkarBackDestination(
    origin + "/language.html?entry=1",
    "https://vercel.com/sso-api?url=preview",
    "profile.html"
);
assert.strictEqual(entryFromVercel.action, "assign");
assert.strictEqual(entryFromVercel.href, "index.html");

console.log("PAGE_BACK_TEST_OK");
