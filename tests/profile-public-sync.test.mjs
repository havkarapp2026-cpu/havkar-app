import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const profile = fs.readFileSync("profile.html", "utf8");

test("profile syncs public name/avatar to profiles on save/upload/remove", () => {
  assert.match(profile, /syncPublicMarketplaceProfile/);
  assert.match(profile, /sanitizePublicProfileName/);
  assert.match(profile, /Public name cannot be an email address/);
  assert.match(profile, /\.from\("profiles"\)/);
  assert.match(profile, /avatar_url:\s*publicUrl/);
  assert.match(profile, /avatar_url:\s*null/);
  assert.match(
    profile,
    /Your full name and profile photo are your public seller identity/
  );
});
