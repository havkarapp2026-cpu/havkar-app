import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const profile = fs.readFileSync("profile.html", "utf8");
const start = profile.indexOf("window.verifyPreviewProject");
const end = profile.indexOf("previewProjectButton.addEventListener");
assert.ok(start > 0 && end > start);
const checker = profile.slice(start, end);

assert.equal(checker.includes('"/api/supabase-project-ref"'), true);
assert.equal(checker.includes("supabase.auth.getSession"), true);
assert.equal(checker.includes("x-havkar-session"), true);
assert.equal(checker.includes("credentials: \"same-origin\""), true);
assert.equal(checker.includes("Sign in is required"), true);
assert.equal(checker.includes("Authentication required"), true);
assert.equal(checker.includes("Server configuration error"), true);
assert.equal(checker.includes("Verification route was not found"), true);
assert.equal(checker.includes("Verification request failed"), true);
assert.equal(checker.includes("Verification failed (HTTP "), true);
assert.equal(checker.includes("Not verified"), false);
assert.equal(checker.includes("output.textContent"), true);
assert.equal(checker.includes("project_ref"), true);
assert.equal(checker.includes("console."), false);
assert.equal(checker.includes("access_token"), true);
assert.equal(checker.includes("Authorization"), false);
assert.equal(/textContent\s*=\s*token/.test(checker), false);
assert.equal(/textContent\s*=\s*previewAccessToken/.test(profile), false);
assert.equal(/textContent\s*=\s*body\b/.test(checker), false);

const host = "havkar-app-git-cursor-stell-609741-havkarapp2026-4055s-projects.vercel.app";
assert.equal(profile.includes(host), true);
assert.equal(profile.includes('id="previewProjectCheck"'), true);
assert.equal(profile.includes('id="previewProjectRef"'), true);

const apiFiles = fs.readdirSync("api").filter((name) => name.endsWith(".js"));
assert.equal(apiFiles.length, 12);
assert.equal(fs.existsSync(path.join("api", "supabase-project-ref.js")), false);

const payment = fs.readFileSync("lib/stellar-ticket-payment.mjs", "utf8");
assert.equal(payment.includes("verifyPreviewProject"), false);

console.log("PREVIEW_PROJECT_CHECK_TEST_OK");
