import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const read = (rel) =>
  readFileSync(new URL(rel.startsWith("../") ? rel : `../${rel}`, import.meta.url), "utf8");

test("home messenger tile uses mint background asset and stays among 15 tiles", () => {
  assert.ok(existsSync(new URL("../assets/home/chat.png", import.meta.url)));
  const index = read("../index.html");
  const tiles = [...index.matchAll(/class="menu-item"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(tiles.length, 15);
  assert.ok(tiles.includes("chat.html"));
});

test("chat wires call gates, attach tray, and rich location module", () => {
  const chat = read("../chat.html");
  assert.ok(/id="chatVoiceCallButton"/.test(chat));
  assert.ok(/id="chatVideoCallButton"/.test(chat));
  assert.ok(/id="attachTray"/.test(chat));
  assert.ok(/id="attachLocationBtn"/.test(chat));
  assert.ok(/havkar-messenger-rich\.js/.test(chat));
  assert.ok(/openMessengerCallGate/.test(chat));
  assert.ok(/openMultiSharePicker/.test(chat));
  assert.ok(/HAVKAR_TURN_/.test(chat));
  assert.ok(/id="actionNewDm"/.test(chat));
  assert.ok(/id="actionGroup"/.test(chat));
  assert.ok(/messenger-action-strip/.test(chat));
  assert.ok(/formatMessagePreviewText/.test(chat));
  assert.ok(/owner-fix-240/.test(chat));
  const script = chat.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/)?.[1] || "";
  assert.doesNotThrow(() => new Function(script));
});

test("production regression: chat inline script must parse (no premature setupEvents close)", () => {
  const chat = read("../chat.html");
  const script = chat.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/)?.[1] || "";
  // The historic Production bug was an extra `}` after notificationsButton that aborted parse.
  assert.doesNotMatch(
    script,
    /goNotifications\(\);\s*\n\s*\}\s*\n\s*\)\s*;\s*\n\s*\$\("blockUserButton"\)/
  );
  assert.doesNotThrow(() => new Function(script));
});

test("rich location encoder rejects invalid coords and builds OSM directions", () => {
  const sandbox = { window: {}, console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read("../havkar-messenger-rich.js"), sandbox);
  const api = sandbox.HAVKAR_MESSENGER_RICH;
  assert.throws(() => api.encodeLocation({ lat: 999, lng: 0 }));
  const enc = api.encodeLocation({ lat: 45.46, lng: 9.19, name: "Milano" });
  const parsed = api.parseLocation(enc);
  assert.equal(parsed.name, "Milano");
  assert.ok(api.directionsUrl(45.46, 9.19, "foot").includes("openstreetmap.org"));
});

test("accommodation and tickets map panels are open by default", () => {
  const acc = read("../accommodation.html");
  const tickets = read("../tickets.html");
  assert.ok(/id="accMapToolsPanel"[^>]*\bopen\b/.test(acc) || /id="accMapToolsPanel" open/.test(acc));
  assert.ok(/id="travelMapPanel"[^>]*\bopen\b/.test(tickets) || /id="travelMapPanel" open/.test(tickets));
  assert.ok(/id="map"/.test(acc));
  assert.ok(/ticketsMapHost/.test(tickets));
});
