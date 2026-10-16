import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { googleSignInAvailability } from "../havkar-login-google.mjs";

const login = fs.readFileSync(
    path.join(import.meta.dirname, "..", "login.html"),
    "utf8"
);
const style = login.slice(
    login.indexOf("<style>"),
    login.indexOf("</style>")
);
const handlerStart = login.indexOf('googleBtn.addEventListener("click"');
const handlerEnd = login.indexOf("/* =========================================================\n   LOGIN");
const handler = login.slice(handlerStart, handlerEnd);

assert.match(style, /\.google-btn\s*\{/);
assert.match(style, /\.google-mark\s*\{/);
assert.ok(handler.includes("googleSignInAvailability"));
assert.ok(handler.includes("Google sign-in is not enabled for this environment."));
assert.ok(
    handler.indexOf("availability === \"disabled\"") <
    handler.indexOf('googleBtn.textContent = "Connecting to Google..."')
);
assert.ok(login.includes('addEventListener("pageshow", restoreGoogleButton)'));
assert.ok(login.includes("Email or password is incorrect."));

function jsonResponse(body, ok = true) {
    return {
        ok,
        async json() {
            return body;
        }
    };
}

assert.equal(await googleSignInAvailability("", "key", async () => {
    throw new Error("should not fetch");
}), "unavailable");

assert.equal(await googleSignInAvailability("https://example.supabase.co", "key", async () => {
    return jsonResponse({ external: { google: false, email: true } });
}), "disabled");

assert.equal(await googleSignInAvailability("https://example.supabase.co", "key", async () => {
    return jsonResponse({ external: { google: true } });
}), "enabled");

assert.equal(await googleSignInAvailability("https://example.supabase.co", "key", async () => {
    return jsonResponse({}, false);
}), "unknown");

assert.equal(await googleSignInAvailability("https://example.supabase.co", "key", async () => {
    throw new Error("network");
}), "unknown");

console.log("LOGIN_GOOGLE_BUTTON_TEST_OK");
