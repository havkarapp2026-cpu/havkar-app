/**
 * Home must remain the public start surface (15 tiles).
 * Owner EUR micro-test must not appear in public nav / start paths.
 */
import assert from "node:assert/strict";
import fs from "node:fs";

const home = fs.readFileSync("index.html", "utf8");
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const owner = fs.readFileSync("owner-eur1-checkout.html", "utf8");
const linksKt = fs.readFileSync(
  "android/app/src/main/java/online/havkar/app/HavkarLinks.kt",
  "utf8"
);
const mainKt = fs.readFileSync(
  "android/app/src/main/java/online/havkar/app/MainActivity.kt",
  "utf8"
);

assert.equal(manifest.start_url, "/index.html");
assert.match(home, /data-havkar-entry="home"/);
assert.equal((home.match(/class="menu-item"/g) || []).length, 15);
assert.doesNotMatch(home, /owner-eur1/);
assert.doesNotMatch(home, /Owner EUR 1\.00/);

for (const page of [
  "buy-sell.html",
  "services.html",
  "profile.html",
  "admin.html",
  "staff.html",
  "login.html"
]) {
  const src = fs.readFileSync(page, "utf8");
  assert.doesNotMatch(
    src,
    /href=["'][^"']*owner-eur1-checkout/,
    page + " must not link Owner EUR micro-test in public UI"
  );
}

assert.match(owner, /noindex/);
assert.match(owner, /href="\/index\.html"/);
assert.match(linksKt, /START_URL = "https:\/\/havkar\.online\/"/);
assert.match(linksKt, /isOwnerMicroTestPath/);
assert.match(linksKt, /resolveLaunchUrl/);
assert.match(mainKt, /onNewIntent/);
assert.match(mainKt, /resolveLaunchUrl/);
assert.match(mainKt, /ACTION_MAIN/);
assert.doesNotMatch(mainKt, /loadUrl\(\s*["']https:\/\/havkar\.online\/owner-eur1/);

console.log("HOME_START_SURFACE_TEST_OK");
