import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const scriptUrl = new URL("../scripts/activate-havkar.mjs", import.meta.url);
const script = fileURLToPath(scriptUrl);
const source = fs.readFileSync(scriptUrl, "utf8");

assert.equal(source.includes("vercel"), false);
assert.equal(source.includes("bundleRelease"), false);
assert.equal(source.includes("STRIPE_SECRET_KEY"), false);
assert.equal(source.includes("google-play-review-accepted"), true);
assert.equal(fs.existsSync(new URL("../launch/google-play-review-accepted", import.meta.url)), false);
assert.equal(fs.existsSync(new URL("../launch/app-store-review-accepted", import.meta.url)), false);
assert.equal(fs.existsSync(new URL("../privacy.html", import.meta.url)), false);

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH }
  });
}

const disabled = run([]);
assert.equal(disabled.status, 2);
assert.match(disabled.stdout, /release is disabled/);
assert.match(disabled.stdout, /not published/);
assert.match(disabled.stdout, /BLOCKED privacy-policy/);
assert.match(disabled.stdout, /BLOCKED android-upload-key/);
assert.match(disabled.stdout, /BLOCKED ios-signing/);
assert.match(disabled.stdout, /READY debug-overlay/);
assert.match(disabled.stdout, /READY stellar-mainnet-guard/);

const authorized = run(["ACTIVATE", "HAVKAR"]);
assert.equal(authorized.status, 1);
assert.match(authorized.stdout, /Release stays disabled/);
assert.match(authorized.stdout, /not published/);
assert.doesNotMatch(authorized.stdout, /uploaded|published successfully|live mode enabled/i);
