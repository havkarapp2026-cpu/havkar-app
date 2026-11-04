import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "havkar-i18n.js"), "utf8");
const languagePage = fs.readFileSync(path.join(root, "language.html"), "utf8");

function storage(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function boot(options) {
  const replaced = [];
  const assigned = [];
  const reloaded = [];
  const session = options.session || storage();
  const local = storage(options.language ? {
    havkar_language: options.language,
    selectedLanguage: options.language,
    language: options.language
  } : {});
  const document = {
    readyState: "loading",
    documentElement: {
      dataset: options.home ? { havkarEntry: "home" } : {},
      lang: "en",
      dir: "ltr",
      setAttribute(name, value) {
        this[name] = value;
      }
    },
    body: null,
    addEventListener() {}
  };
  const location = {
    pathname: options.pathname,
    search: options.search || "",
    href: "https://havkar-preview-test.vercel.app" + options.pathname + (options.search || ""),
    replace(url) {
      replaced.push(url);
    },
    assign(url) {
      assigned.push(url);
    },
    reload() {
      reloaded.push(true);
    }
  };
  const context = {
    document,
    location,
    localStorage: local,
    sessionStorage: session,
    URLSearchParams,
    window: null,
    console
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "havkar-i18n.js" });
  return { context, replaced, assigned, reloaded, session };
}

const firstHome = boot({
  pathname: "/index.html",
  home: true
});
assert.deepStrictEqual(firstHome.replaced, ["language.html?entry=1"]);

const entry = boot({
  pathname: "/language.html",
  search: "?entry=1",
  session: firstHome.session
});
assert.deepStrictEqual(entry.replaced, []);
assert.equal(entry.session.getItem("havkar_language_entry"), "shown");

const returnHome = boot({
  pathname: "/index.html",
  home: true,
  session: entry.session
});
assert.deepStrictEqual(returnHome.replaced, []);

const savedEntry = boot({
  pathname: "/language.html",
  search: "?entry=1",
  language: "it"
});
assert.deepStrictEqual(savedEntry.replaced, []);
savedEntry.context.HAVKAR_I18N.setLanguage("de");
assert.equal(savedEntry.context.localStorage.getItem("havkar_language"), "de");
assert.deepStrictEqual(savedEntry.reloaded, [true]);
assert.deepStrictEqual(savedEntry.replaced, []);

const afterSelection = boot({
  pathname: "/language.html",
  search: "?entry=1",
  language: "de",
  session: savedEntry.session
});
assert.deepStrictEqual(afterSelection.replaced, []);

const settings = boot({
  pathname: "/language.html",
  language: "fr"
});
assert.deepStrictEqual(settings.replaced, []);
settings.context.HAVKAR_I18N.setLanguage("ckb");
assert.equal(settings.context.localStorage.getItem("havkar_language"), "ckb");
assert.equal(settings.context.localStorage.getItem("havkar_language_dir"), "rtl");
assert.deepStrictEqual(settings.reloaded, [true]);
assert.deepStrictEqual(settings.replaced, []);

assert.match(languagePage, /havkar-preview-access\.js/);
assert.match(languagePage, /onclick="goTo\('index\.html'\)"/);
assert.match(languagePage, /onclick="goBack\(\)"/);
assert.match(languagePage, /window\.location\.assign\(\s*page\s*\)/);
assert.match(languagePage, /window\.havkarNavigateBack/);
assert.match(languagePage, /i18n\.setLanguage\(\s*languageCode\s*\)/);
assert.doesNotMatch(source, /onLanguagePage[\s\S]{0,400}index\.html/);

console.log("LANGUAGE_NAVIGATION_TEST_OK");
