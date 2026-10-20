import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const { havkarAuthRedirect } = createRequire(import.meta.url)("../havkar-auth-redirect.js");

const preview = "https://havkar-app-git-cursor-stell-609741-havkarapp2026-4055s-projects.vercel.app";
const staging = "https://staging.havkar.online";
const production = "https://havkar-app.vercel.app";
const testnet = "https://testnet.havkar.online";

assert.equal(
    havkarAuthRedirect("login.html", preview + "/login.html"),
    preview + "/login.html"
);
assert.equal(
    havkarAuthRedirect("login.html", preview + "/login.html?next=index.html"),
    preview + "/login.html"
);
assert.equal(
    havkarAuthRedirect("login.html", staging + "/signup.html"),
    staging + "/login.html"
);
assert.equal(
    havkarAuthRedirect("login.html", production + "/"),
    production + "/login.html"
);
assert.equal(
    havkarAuthRedirect("login.html", testnet + "/login.html"),
    testnet + "/login.html"
);
assert.equal(
    havkarAuthRedirect("https://staging.havkar.online/login.html", preview + "/login.html"),
    preview + "/login.html"
);

for (const name of ["login.html", "signup.html"]) {
    const source = fs.readFileSync(name, "utf8");
    assert.equal(source.includes("havkar-auth-redirect.js"), true, name);
    assert.equal(
        source.includes("signInWithOAuth({provider:'google'") ||
            source.includes('provider: "google"'),
        true,
        name
    );
    assert.equal(source.includes("havkarAuthRedirect("), true, name);
    assert.equal(source.includes("staging.havkar.online"), false, name);
}

console.log("AUTH_REDIRECT_TEST_OK");
