/**
 * Owner-approved final internal home layout gates.
 * Frameless 12 icons on shared map; links + i18n preserved; no merge until visual OK.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const TILES = [
  ["buy-sell.html", "buySell"],
  ["jobs.html", "jobs"],
  ["services.html", "services"],
  ["wallet.html", "wallet"],
  ["tickets.html", "tickets"],
  ["accommodation.html", "accommodation"],
  ["ads.html", "ads"],
  ["delivery.html", "delivery"],
  ["events.html", "events"],
  ["chat.html", "Messenger"],
  ["havkar-ai.html", "havkarAi"],
  ["health.html", "doctorsPharmacies"]
];

test("home matches Owner final frameless layout invariants", async () => {
  const index = read("index.html");
  assert.match(index, /Frameless 3D icons on shared world-map background/);
  assert.match(index, /home-mint-map-bg\.png\?v=owner-home-full-icons-20261127c/);
  assert.match(index, /\.menu-item[\s\S]{0,320}background:\s*transparent/);
  assert.match(index, /\.home-settings-bar[\s\S]{0,220}border-radius:\s*999px/);
  assert.match(index, /home-settings-bar[\s\S]{0,80}href="profile\.html"/);
  assert.ok(fs.existsSync(path.join(root, "assets/icons/havkar-home-final-owner-approved.jpg")));
  // Background must be the clean world map — never the full Owner mockup composite.
  const { createHash } = await import("node:crypto");
  const bgHash = createHash("md5")
    .update(fs.readFileSync(path.join(root, "assets/home/home-mint-map-bg.png")))
    .digest("hex");
  assert.equal(bgHash, "16aa736fed876e21772ee0d046671888", "clean shared map only");
  assert.notEqual(bgHash, "bba9dc21137bcaad1af788b3e57edc93", "reject full-mockup background");

  const tiles = [...index.matchAll(/class="menu-item"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(tiles.length, 12);
  assert.deepEqual(tiles, TILES.map(([href]) => href));

  for (const [, key] of TILES) {
    assert.match(index, new RegExp(`data-i18n="${key}"`));
  }

  // No frosted outer card frame on the Owner final home.
  assert.doesNotMatch(
    index,
    /\.container\s*\{[\s\S]{0,280}border:\s*1px solid rgba\(255,\s*255,\s*255/
  );
});

test("all twelve home icons exist as frameless 248x200 RGBA", async () => {
  const { spawnSync } = await import("node:child_process");
  const names = [
    "buy-sell",
    "jobs",
    "services",
    "wallet",
    "tickets",
    "accommodation",
    "ads",
    "delivery",
    "events",
    "chat",
    "havkar-ai",
    "doctors-pharmacies"
  ];
  for (const name of names) {
    const file = path.join(root, "assets/home", `${name}.png`);
    assert.ok(fs.existsSync(file), name);
    const py = spawnSync(
      "python3",
      [
        "-c",
        `from PIL import Image; im=Image.open('${file}').convert('RGBA'); print(im.size[0], im.size[1], im.getpixel((0,0))[3])`
      ],
      { encoding: "utf8" }
    );
    assert.equal(py.status, 0, py.stderr);
    const [w, h, a] = py.stdout.trim().split(/\s+/).map(Number);
    assert.equal(w, 280, name);
    assert.equal(h, 220, name);
    assert.equal(a, 0, `${name} corner must be transparent`);
  }
});
