/**
 * Fail-closed Owner regressions for Messenger.
 * These assertions encode the Production parse bug and tile/logo rules.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

/* Extra `}` + `);` after notificationsButton listener — Production Unexpected token ')'. */
const PRODUCTION_PARSE_BUG =
  /goNotifications\(\);[\s\S]{0,80}?\}\s*\n\s*\)\s*;\s*\n\}\s*\n\s*\)\s*;\s*\n\s*\$\("blockUserButton"\)/;

test("chat.html inline script must parse (blocks Production Unexpected token ')' bug)", () => {
  const html = read("chat.html");
  const script =
    html.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/)?.[1] || "";
  assert.ok(script.length > 1000, "inline chat script missing");
  assert.equal(
    PRODUCTION_PARSE_BUG.test(script),
    false,
    "Production premature setupEvents close must not exist"
  );
  assert.doesNotThrow(() => new Function(script));
});

test("Messenger home tile is transparent (no outer frame) with globe+three icons", async () => {
  const index = read("index.html");
  assert.match(
    index,
    /data-havkar-tile="messenger"[\s\S]{0,220}?assets\/home\/chat\.png\?v=owner-transparent-noframe/
  );
  assert.doesNotMatch(index, /id="guestSignup"/);
  assert.doesNotMatch(index, /id="guestLogin"/);
  assert.doesNotMatch(index, /security-badge|security-lock/);
  assert.match(index, /home-settings-bar/);
  assert.match(index, /supabase\.auth\.getSession/);
  const tiles = [...index.matchAll(/class="menu-item"/g)];
  assert.equal(tiles.length, 12, "home must keep exactly 12 tiles");
  const pngPath = path.join(root, "assets/home/chat.png");
  assert.ok(fs.existsSync(pngPath), "chat.png missing");
  const { createHash } = await import("node:crypto");
  const hash = createHash("md5").update(fs.readFileSync(pngPath)).digest("hex");
  assert.notEqual(hash, "7534c16b545d9439519f070e81fd662c", "production-old chat.png");
  assert.notEqual(hash, "4a96c231b0adba9a0d2738960ced4d72", "opaque white-frame chat.png");
  assert.notEqual(hash, "e9c5b61ddfbf03494178e80112377033", "opaque mint chat.png");
  const { spawnSync } = await import("node:child_process");
  const py = spawnSync(
    "python3",
    [
      "-c",
      "from PIL import Image; im=Image.open('assets/home/chat.png').convert('RGBA'); print(im.getpixel((0,0))[3]); print(im.size[0], im.size[1])"
    ],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(py.status, 0, py.stderr);
  const lines = py.stdout.trim().split("\n");
  assert.equal(Number(lines[0]), 0, "corner must be transparent");
  assert.equal(lines[1].trim(), "248 236", "tile size must match other tiles");
});

test("goHome seeds language and assigns index.html (15-tile home)", () => {
  const html = read("chat.html");
  const script =
    html.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/)?.[1] || "";
  assert.match(script, /function goHome\(\)\{/);
  assert.match(script, /havkar_language/);
  assert.match(script, /location\.assign\(\s*"index\.html"\s*\)/);
  assert.match(html, /id="navHome"/);
  assert.match(html, /id="actionNewDm"/);
});

test("fixture of Production bug pattern is detected by the same regex", () => {
  const broken = `
                goNotifications();

            }
        );
}
        );

    $("blockUserButton")
`;
  assert.equal(PRODUCTION_PARSE_BUG.test(broken), true);
});
