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

test("Messenger home tile uses exact Owner image3 mint logo without triple icons", async () => {
  const index = read("index.html");
  assert.match(
    index,
    /data-havkar-tile="messenger"[\s\S]{0,220}?assets\/home\/chat\.png\?v=owner-image3-exact/
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
  // Reject both Production-old mint and the rejected triple-icon composite.
  assert.notEqual(hash, "7534c16b545d9439519f070e81fd662c", "production-old chat.png");
  assert.notEqual(hash, "4a96c231b0adba9a0d2738960ced4d72", "rejected triple-icon chat.png");
  assert.equal(hash, "e9c5b61ddfbf03494178e80112377033", "must be exact Owner mint image3");
  const { spawnSync } = await import("node:child_process");
  const py = spawnSync(
    "python3",
    [
      "-c",
      "from PIL import Image; im=Image.open('assets/home/chat.png').convert('RGB'); print(','.join(map(str, im.getpixel((0,0)))))"
    ],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(py.status, 0, py.stderr);
  const corner = py.stdout.trim().split(",").map(Number);
  assert.ok(corner[0] > 200 && corner[1] > 200 && corner[2] > 200, `corner not mint/white: ${corner}`);
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
