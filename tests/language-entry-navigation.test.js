const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const back = require("../havkar-page-back.js");

const origin = "https://havkar-app-git-cursor-stell-609741-havkarapp2026-4055s-projects.vercel.app";
const key = back.LANGUAGE_ENTRY_HOME_ONCE;

function memoryStorage(initial) {
    const values = Object.assign({}, initial);
    return {
        getItem(name) {
            return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null;
        },
        setItem(name, value) {
            values[name] = String(value);
        },
        removeItem(name) {
            delete values[name];
        }
    };
}

const storage = memoryStorage();
assert.strictEqual(back.armLanguageEntryHomeOnce(storage), true);
assert.strictEqual(back.takeLanguageEntryHomeOnce(storage), true, "explicit home is allowed once");
assert.strictEqual(back.takeLanguageEntryHomeOnce(storage), false, "refresh consumes the bypass");
assert.strictEqual(storage.getItem(key), null);

const profileBack = back.havkarBackDestination(
    origin + "/language.html",
    origin + "/profile.html",
    "profile.html"
);
assert.strictEqual(profileBack.action, "history", "profile language settings keep history");

const firstBack = back.havkarBackDestination(
    origin + "/language.html?entry=1",
    origin + "/index.html",
    "profile.html"
);
assert.strictEqual(firstBack.action, "assign");
assert.strictEqual(firstBack.href, "index.html");

function runBack(href, referrer, state) {
    const calls = { back: 0, assign: "" };
    const box = memoryStorage();
    global.window = {
        location: {
            href: href,
            assign(next) {
                calls.assign = next;
            }
        },
        history: {
            state: state,
            back() {
                calls.back += 1;
            }
        },
        sessionStorage: box
    };
    global.document = {
        referrer: referrer,
        body: {
            getAttribute() {
                return "profile.html";
            }
        }
    };
    back.navigateBack();
    return { calls, box };
}

const arrow = runBack(
    origin + "/language.html?entry=1",
    "https://vercel.com/sso-api?url=" + encodeURIComponent(origin + "/"),
    null
);
assert.strictEqual(arrow.calls.back, 0, "entry back does not use history");
assert.strictEqual(arrow.calls.assign, "index.html");
assert.strictEqual(arrow.box.getItem(key), "1");

const guarded = runBack(
    origin + "/language.html?entry=1",
    origin + "/index.html",
    { havkarBackGuard: true }
);
assert.strictEqual(guarded.calls.back, 1, "guard pops before Home");
assert.strictEqual(guarded.calls.assign, "");
assert.strictEqual(guarded.box.getItem(key), "1", "guard path still arms Home");

const settings = runBack(
    origin + "/language.html",
    origin + "/profile.html",
    null
);
assert.strictEqual(settings.calls.back, 1);
assert.strictEqual(settings.calls.assign, "");
assert.strictEqual(settings.box.getItem(key), null, "settings back does not arm Home");

function runEntry(options) {
    const i18n = fs.readFileSync(path.join(__dirname, "..", "havkar-i18n.js"), "utf8");
    const replaced = [];
    const session = memoryStorage(options.session);
    const local = memoryStorage(options.local);
    const document = {
        documentElement: {
            dataset: { havkarEntry: options.home ? "home" : "" },
            lang: "",
            dir: "",
            setAttribute() {}
        },
        body: {},
        readyState: "loading",
        addEventListener() {},
        createTreeWalker() {
            return { nextNode() { return null; } };
        },
        dispatchEvent() {},
        querySelectorAll() {
            return [];
        }
    };
    const context = vm.createContext({
        window: {
            location: {
                pathname: options.pathname,
                search: options.search,
                href: origin + options.pathname + options.search,
                replace(next) {
                    replaced.push(next);
                },
                reload() {}
            },
            addEventListener() {},
            setTimeout() {
                return 0;
            },
            clearTimeout() {},
            HAVKAR_I18N: null
        },
        document: document,
        localStorage: local,
        sessionStorage: session,
        MutationObserver: function () {},
        CustomEvent: function () {},
        URLSearchParams: URLSearchParams,
        Promise: Promise,
        console: console
    });
    context.window.document = document;
    vm.runInContext(i18n, context);
    return { replaced, session };
}

const firstVisit = runEntry({
    home: true,
    pathname: "/index.html",
    search: "",
    local: {},
    session: {}
});
assert.deepStrictEqual(firstVisit.replaced, ["language.html?entry=1"], "first visit");

const explicitHome = runEntry({
    home: true,
    pathname: "/index.html",
    search: "",
    local: {},
    session: { [key]: "1" }
});
assert.deepStrictEqual(explicitHome.replaced, [], "Home tap stays");
assert.strictEqual(explicitHome.session.getItem(key), null, "bypass is one-time");

const refresh = runEntry({
    home: true,
    pathname: "/index.html",
    search: "",
    local: {},
    session: {}
});
assert.deepStrictEqual(refresh.replaced, ["language.html?entry=1"], "refresh asks again");

const saved = runEntry({
    home: true,
    pathname: "/index.html",
    search: "",
    local: { havkar_language: "fa" },
    session: {}
});
assert.deepStrictEqual(saved.replaced, [], "saved language skips the gate");

const languageRefresh = runEntry({
    home: false,
    pathname: "/language.html",
    search: "?entry=1",
    local: {},
    session: {}
});
assert.deepStrictEqual(languageRefresh.replaced, [], "language refresh stays");

const chosen = runEntry({
    home: false,
    pathname: "/language.html",
    search: "?entry=1",
    local: { havkar_language: "en" },
    session: {}
});
assert.deepStrictEqual(chosen.replaced, ["index.html"], "chosen language returns Home");

const languageSource = fs.readFileSync(path.join(__dirname, "..", "language.html"), "utf8");
assert.strictEqual(languageSource.includes("allowHomePastLanguageEntry"), true);
assert.strictEqual(languageSource.includes('goTo(\'index.html\')'), true);

console.log("LANGUAGE_ENTRY_NAVIGATION_TEST_OK");
