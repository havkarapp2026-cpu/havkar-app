const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(
    path.join(__dirname, "../havkar-countries.js"),
    "utf8"
);
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const countries = sandbox.window.HAVKAR_COUNTRIES;

assert.strictEqual(
    countries.listingCountryCode({ location: "Crotone italia" }),
    "IT"
);
assert.strictEqual(
    countries.listingCountryCode({ location: "Crotone Italia" }),
    "IT"
);
assert.strictEqual(
    countries.listingCountryCode({ location: "Crotone Italy" }),
    "IT"
);
assert.strictEqual(
    countries.listingCountryCode({ location: "Crotone IT" }),
    "IT"
);
assert.strictEqual(
    countries.listingCountryCode({ country_code: "it" }),
    "IT"
);
assert.strictEqual(
    countries.listingCountryCode({ country_code: "IT", location: "Paris" }),
    "IT"
);
assert.strictEqual(
    countries.listingCountryCode({ country_code: "FR", location: "Crotone italia" }),
    "FR"
);
assert.strictEqual(
    countries.listingCountryCode({ location: "Berlin, Germany" }),
    "DE"
);
assert.strictEqual(
    countries.listingCountryCode({ location: "Stockholm, Sweden" }),
    "SE"
);
assert.strictEqual(
    countries.listingCountryCode({ city: "Paris", location: "France" }),
    "FR"
);
assert.strictEqual(
    countries.listingCountryCode({ location: "Crotone italia" }) === "NL",
    false
);
assert.strictEqual(
    countries.listingCountryCode({ title: "Formaggio Gouda Holland", location: "Crotone italia" }),
    "IT"
);
assert.strictEqual(
    countries.listingCountryCode({ location: "Waiting for details" }),
    ""
);

const page = fs.readFileSync(
    path.join(__dirname, "../buy-sell.html"),
    "utf8"
);
assert.ok(page.includes("listingCountryCode"));
assert.ok(!page.includes('ad.country_code ||\n                        ""\n                    ).trim().toUpperCase()'));

console.log("COUNTRY_MATCH_TEST_OK");
