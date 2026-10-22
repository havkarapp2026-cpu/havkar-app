import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(name) {
  return fs.readFileSync(path.join(root, name));
}

function pngSize(bytes) {
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

const expected = [16, 32, 48, 180, 192, 512, 1024];
for (const size of expected) {
  const file = `assets/icons/havkar-icon-${size}-20261022.png`;
  const sizeInfo = pngSize(read(file));
  assert.deepEqual(sizeInfo, { width: size, height: size }, file);
}

const icon1024 = read("assets/icons/havkar-icon-1024-20261022.png");
assert.deepEqual(read("icon.png"), icon1024);

const ico = read("favicon.ico");
assert.equal(ico.readUInt16LE(0), 0);
assert.equal(ico.readUInt16LE(2), 1);
assert.equal(ico.readUInt16LE(4), 3);

const manifest = JSON.parse(read("manifest.json").toString("utf8"));
assert.equal(manifest.name, "HAVKAR");
assert.equal(manifest.short_name, "HAVKAR");
assert.equal(manifest.start_url, "/");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.icons.length, 3);
assert.deepEqual(
  manifest.icons.map((icon) => [icon.src, icon.sizes, icon.type, icon.purpose]),
  [
    ["/assets/icons/havkar-icon-192-20261022.png", "192x192", "image/png", "any"],
    ["/assets/icons/havkar-icon-512-20261022.png", "512x512", "image/png", "any"],
    ["/assets/icons/havkar-icon-1024-20261022.png", "1024x1024", "image/png", "any"]
  ]
);
assert.equal(JSON.stringify(manifest).includes("icon.png"), false);

const header = read("assets/home/header.png");
assert.equal(
  header.length,
  427865
);

const home = read("index.html").toString("utf8");
assert.match(home, /src="assets\/home\/header\.png"/);
assert.match(home, /rel="manifest" href="\/manifest\.json"/);
assert.match(home, /rel="apple-touch-icon" sizes="180x180"/);
assert.doesNotMatch(home, /href="icon\.png"|src="icon\.png"/);

for (const file of fs.readdirSync(root).filter((name) => name.endsWith(".html"))) {
  const html = read(file).toString("utf8");
  assert.match(html, /rel="manifest" href="\/manifest\.json"/, file);
  assert.match(html, /rel="icon" type="image\/png" sizes="32x32"/, file);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180"/, file);
  assert.equal(html.includes("icon.png"), false, file);
}

const worker = read("sw.js").toString("utf8");
assert.equal(worker.includes("icon.png"), false);
assert.equal(worker.includes("caches"), false);

console.log("OFFICIAL_APP_ICON_TEST_OK");
