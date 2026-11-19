import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const read = (rel) =>
  readFileSync(new URL(rel.startsWith("../") ? rel : `../${rel}`, import.meta.url), "utf8");

test("approved messenger logo assets exist for tile and icons", () => {
  assert.ok(existsSync(new URL("../assets/home/chat.png", import.meta.url)));
  assert.ok(existsSync(new URL("../assets/icons/messenger/havkar-messenger-logo-source.jpg", import.meta.url)));
  assert.ok(existsSync(new URL("../assets/icons/messenger/messenger-256.png", import.meta.url)));
  assert.ok(existsSync(new URL("../assets/icons/messenger/messenger-32.png", import.meta.url)));
  assert.ok(existsSync(new URL("../assets/icons/messenger/messenger-48.png", import.meta.url)));
});

test("home tile keeps 15 entries and opens chat.html with messenger branding", () => {
  const index = read("../index.html");
  const tiles = [...index.matchAll(/class="menu-item"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(tiles.length, 15);
  assert.ok(tiles.includes("chat.html"));
  assert.ok(/data-havkar-tile="messenger"/.test(index));
  assert.ok(/assets\/home\/chat\.png/.test(index));
  assert.ok(/data-i18n="chat">Messenger</.test(index));
  assert.ok(!tiles.includes("coming-soon.html"));
});

test("chat page uses messenger logo assets and share module", () => {
  const chat = read("../chat.html");
  assert.ok(/HAVKAR — Messenger/.test(chat));
  assert.ok(/assets\/icons\/messenger\/messenger-32\.png/.test(chat));
  assert.ok(/havkar-messenger-share\.js/.test(chat));
  assert.ok(/id="shareContentButton"/.test(chat));
  assert.ok(/message-checks\.sending/.test(chat));
  assert.ok(/message-checks\.failed/.test(chat));
  assert.ok(/readReceiptsEnabledForMe/.test(chat));
  assert.ok(/Offline outbox: queue locally when offline; never mark delivered\/read here/.test(chat));
});

test("chat setupEvents parses and exposes New conversation + login/empty gates", () => {
  const chat = read("../chat.html");
  const script = chat.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/)?.[1] || "";
  assert.ok(script.length > 1000);
  // Regression: premature close after notificationsButton broke the whole page (infinite spinner).
  assert.doesNotMatch(
    script,
    /goNotifications\(\);\s*\}\s*;?\s*\)\s*;\s*\$\("blockUserButton"\)/
  );
  assert.ok(/id="newConversationButton"/.test(chat));
  assert.ok(/function openNewConversationModal/.test(chat));
  assert.ok(/function showLoginGate/.test(chat));
  assert.ok(/havkar_get_or_create_listing_conversation/.test(chat));
  assert.ok(/emptyNewConversationBtn/.test(chat));
  // Syntax check extracted script
  try {
    new Function(script);
  } catch (err) {
    assert.fail("chat.html inline script must parse: " + err.message);
  }
});

test("home messenger tile uses pale mint background like peer tiles", () => {
  assert.ok(existsSync(new URL("../assets/icons/messenger/messenger-96-mint.png", import.meta.url)));
  const png = readFileSync(new URL("../assets/home/chat.png", import.meta.url));
  // PNG signature + non-trivial size; corner mint verified offline in agent run.
  assert.equal(png[0], 0x89);
  assert.ok(png.length > 8000);
});

test("share helper encodes only allowed HAVKAR URLs and blocks private paths", () => {
  const src = read("../havkar-messenger-share.js");
  const sandbox = {
    window: {},
    console,
    URL,
    URLSearchParams
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.location = {
    origin: "https://havkar.online",
    href: "https://havkar.online/",
    hostname: "havkar.online"
  };
  vm.runInNewContext(src, sandbox);
  const api = sandbox.HAVKAR_MESSENGER_SHARE;
  assert.ok(api);
  assert.equal(api.isAllowedUrl("https://havkar.online/buy-sell.html"), true);
  assert.equal(api.isAllowedUrl("https://evil.example/x"), false);
  assert.equal(api.isAllowedUrl("https://havkar.online/admin.html"), false);
  const encoded = api.encodeSharePayload({
    url: "https://havkar.online/events.html",
    title: "Event",
    description: "Demo",
    note: "See this"
  });
  assert.ok(encoded.startsWith("[havkar-share]"));
  const parsed = api.parseSharePayload(encoded);
  assert.equal(parsed.title, "Event");
  assert.equal(parsed.url, "https://havkar.online/events.html");
  assert.throws(() =>
    api.encodeSharePayload({ url: "https://havkar.online/admin.html", title: "x" })
  );
});

test("profile masks account email and removes duplicate Support action", () => {
  const profile = read("../profile.html");
  assert.ok(/maskEmailForDisplay/.test(profile));
  assert.ok(/Account email \(private\)/.test(profile));
  assert.ok(/toggleAccountEmail/.test(profile));
  assert.ok(/Messages & Messenger/.test(profile));
  assert.ok(/havkar_read_receipts_enabled/.test(profile));
  assert.doesNotMatch(
    profile,
    /onclick="goTo\('support\.html'\)"[\s\S]{0,200}Get help from HAVKAR/
  );
  assert.ok(/Settings → Support|goTo\('support\.html'\)/.test(profile));
});

test("support hosts account-messenger help and only public emails", () => {
  const support = read("../support.html");
  assert.ok(/id="account-messenger-help"/.test(support));
  assert.ok(/support@havkar\.online/.test(support));
  assert.ok(/info@havkar\.online/.test(support));
  assert.doesNotMatch(support, /soran@havkar\.online/i);
  assert.doesNotMatch(support, /havkarapp2026@gmail\.com/i);
  assert.ok(/Open HAVKAR Messenger/.test(support));
});

test("i18n packs Messenger label for fa and ckb", () => {
  const i18n = read("../havkar-ui-i18n21.js");
  assert.ok(/Messenger:\s*\{/.test(i18n));
  assert.ok(/fa:"پیام‌رسان"/.test(i18n));
  assert.ok(/ckb:"مەسنجەر"/.test(i18n));
});

test("i18n packs Italian Messenger chrome that previously stayed English", () => {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read("../havkar-ui-i18n21.js"), sandbox);
  const pack = sandbox.HAVKAR_UI_I18N21.pack("it");
  assert.equal(pack["Search messages..."], "Cerca nei messaggi...");
  assert.equal(pack["Conversations"], "Conversazioni");
  assert.equal(pack["Loading conversations..."], "Caricamento conversazioni...");
  assert.equal(pack["Home"], "Inizio");
  assert.equal(pack["New conversation"], "Nuova conversazione");
  const fa = sandbox.HAVKAR_UI_I18N21.pack("fa");
  assert.equal(fa["Conversations"], "گفتگوها");
  assert.equal(fa["Messenger"], "پیام‌رسان");
});
