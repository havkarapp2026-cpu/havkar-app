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

test("Messenger home tile uses Owner-approved attach fitted to other-tile canvas", async () => {
  const index = read("index.html");
  assert.match(
    index,
    /data-havkar-tile="messenger"[\s\S]{0,220}?assets\/home\/chat\.png\?v=owner-approved-attach/
  );
  assert.doesNotMatch(index, /id="guestSignup"/);
  assert.doesNotMatch(index, /id="guestLogin"/);
  assert.doesNotMatch(index, /security-badge|security-lock/);
  assert.match(index, /home-settings-bar/);
  assert.match(index, /supabase\.auth\.getSession/);
  const tiles = [...index.matchAll(/class="menu-item"/g)];
  assert.equal(tiles.length, 12, "home must keep exactly 12 tiles");
  const pngPath = path.join(root, "assets/home/chat.png");
  const srcPath = path.join(root, "assets/icons/messenger/havkar-messenger-tile-owner-approved.webp");
  assert.ok(fs.existsSync(pngPath), "chat.png missing");
  assert.ok(fs.existsSync(srcPath), "owner-approved source missing");
  const { createHash } = await import("node:crypto");
  const hash = createHash("md5").update(fs.readFileSync(pngPath)).digest("hex");
  // Reject damaged / wrong lineages.
  assert.notEqual(hash, "dfbda26de9f6b9696ab5a3ecd53dc73d", "damaged mint-restored chat.png");
  assert.notEqual(hash, "0408ec880fd67816e124e0311c37aee1", "damaged transparent chat.png");
  assert.notEqual(hash, "4a96c231b0adba9a0d2738960ced4d72", "old triple chat.png");
  assert.equal(hash, "20d10faa664291fee484d2f534609ac5", "must be Owner-approved attach fitted tile");
  const srcHash = createHash("md5").update(fs.readFileSync(srcPath)).digest("hex");
  assert.equal(srcHash, "ca7d36bde0f723f52776d27a35e88eb6", "owner source bytes must stay exact");
  const { spawnSync } = await import("node:child_process");
  const py = spawnSync(
    "python3",
    [
      "-c",
      "from PIL import Image; im=Image.open('assets/home/chat.png').convert('RGBA'); print(im.size[0], im.size[1]); print(im.getpixel((0,0))[3]); print(sum(im.getpixel((124,220))[:3])/3)"
    ],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(py.status, 0, py.stderr);
  const lines = py.stdout.trim().split("\n");
  assert.equal(lines[0].trim(), "248 236", "tile size must match other tiles");
  assert.equal(Number(lines[1]), 255, "opaque plate like other tiles");
  assert.ok(Number(lines[2]) > 240, "bottom label band must stay clear/light");
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
