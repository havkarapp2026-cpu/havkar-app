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

function withNavigation(options) {

    const previousWindow = global.window;
    const previousDocument = global.document;
    const calls = {
        back: 0,
        assign: []
    };

    global.window = {
        location: {
            href: options.href,
            assign: function (href) {
                calls.assign.push(href);
            }
        },
        history: {
            length: options.length,
            state: null,
            back: function () {
                calls.back += 1;
            }
        }
    };

    global.document = {
        referrer: options.referrer,
        body: {
            getAttribute: function () {
                return "";
            }
        }
    };

    try {
        back.navigateBack();
    } finally {
        global.window = previousWindow;
        global.document = previousDocument;
    }

    return calls;
}

const homeEntry = withNavigation({
    href: origin + "/buy-sell.html",
    referrer: origin + "/",
    length: 2
});
assert.strictEqual(homeEntry.back, 1);
assert.deepStrictEqual(homeEntry.assign, []);

const openedWithoutHistory = withNavigation({
    href: origin + "/buy-sell.html",
    referrer: origin + "/",
    length: 1
});
assert.strictEqual(openedWithoutHistory.back, 0);
assert.deepStrictEqual(openedWithoutHistory.assign, ["index.html"]);

const emptyHistory = withNavigation({
    href: origin + "/buy-sell.html",
    referrer: origin + "/index.html",
    length: 0
});
assert.strictEqual(emptyHistory.back, 0);
assert.deepStrictEqual(emptyHistory.assign, ["index.html"]);

console.log("PAGE_BACK_TEST_OK");
