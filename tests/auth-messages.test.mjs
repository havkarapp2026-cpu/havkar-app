import assert from "node:assert/strict";
import fs from "node:fs";
import {
    authDirection,
    authFailureMessage,
    authLanguages,
    authMessage,
    authMessageCoverage
} from "../havkar-auth-messages.mjs";

const coverage = authMessageCoverage();
assert.equal(coverage.missing.length, 0, coverage.missing.slice(0, 5).join(" | "));
assert.equal(coverage.languages, 20);
assert.ok(coverage.keys >= 30);

const languages = authLanguages();
assert.equal(languages.length, 21);
assert.equal(authDirection("ckb"), "rtl");
assert.equal(authDirection("kmr"), "ltr");
assert.equal(authDirection("fa"), "rtl");
assert.equal(authDirection("ar"), "rtl");
assert.equal(authDirection("ur"), "rtl");
assert.equal(authDirection("en"), "ltr");

const sample = "Email or password is incorrect. You can try again or reset your password below.";
assert.equal(authMessage(sample, "en"), sample);
assert.notEqual(authMessage(sample, "fa"), sample);
assert.notEqual(authMessage(sample, "ckb"), sample);
assert.notEqual(authMessage(sample, "kmr"), authMessage(sample, "ckb"));
assert.equal(authMessage("unknown sentence", "fa"), "unknown sentence");

assert.equal(
    authFailureMessage({ code: "over_email_send_rate_limit" }, "fallback"),
    "Too many messages were sent. Please wait and try again."
);
assert.equal(
    authFailureMessage({ code: "email_not_confirmed" }, "fallback"),
    "Your email address is not confirmed. Please confirm your email before logging in."
);
assert.equal(authFailureMessage({ message: "network" }, "fallback"), "fallback");

const login = fs.readFileSync(new URL("../login.html", import.meta.url), "utf8");
const signup = fs.readFileSync(new URL("../signup.html", import.meta.url), "utf8");
assert.match(login, /data-i18n-ignore/);
assert.match(login, /authMessage\(text, language\)/);
assert.match(login, /Open this link in the same browser/);
assert.match(login, /This sign-in link could not be completed/);
assert.match(signup, /googleSignInAvailability/);
assert.match(signup, /authFailureMessage/);
assert.ok(signup.indexOf("availability==='disabled'") < signup.indexOf("Connecting to Google..."));
for (const file of ["jobs.html", "profile.html", "wallet.html", "chat.html", "business.html", "business-studio.html", "index.html", "login.html", "signup.html"]) {
    const source = fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
    assert.match(source, /persistSession\s*:\s*true/);
    assert.match(source, /flowType\s*:\s*["']pkce["']/);
}

console.log("AUTH_MESSAGES_TEST_OK");
