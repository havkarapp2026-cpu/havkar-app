/**
 * Messenger design + verification badges UI gates (Owner mandate).
 * No merge/production until Owner confirms attached artwork.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const require = createRequire(import.meta.url);

test("home keeps exactly 12 tiles and messenger tile points at chat.png", () => {
  const index = read("index.html");
  const tiles = [...index.matchAll(/class="menu-item"[^>]*href="([^"]+)"/g)].map(
    (m) => m[1]
  );
  assert.equal(tiles.length, 12);
  assert.ok(tiles.includes("chat.html"));
  assert.match(index, /data-havkar-tile="messenger"/);
  assert.match(index, /assets\/home\/chat\.png\?v=owner-home-true-frameless-20261127/);
  assert.doesNotMatch(index, /id="guestSignup"|id="guestLogin"|security-lock/);
});

test("chat page wires messenger logo, search, voice/video chrome, receipt structure", () => {
  const chat = read("chat.html");
  assert.match(chat, /assets\/icons\/messenger\/messenger-32\.png|messenger-256\.png|messenger-96/);
  assert.match(chat, /id="searchInput"/);
  assert.match(chat, /actionVoice|chatVoiceCallButton/);
  assert.match(chat, /actionVideo|chatVideoCallButton/);
  assert.match(chat, /openMessengerCallGate/);
  assert.match(chat, /message-checks\.sent/);
  assert.match(chat, /message-checks\.delivered/);
  assert.match(chat, /message-checks\.read/);
  assert.match(chat, /hk-read-mark|message-read-mark\.png/);
  assert.match(chat, /Never claim delivered\/read without server timestamps/);
  assert.match(chat, /textContent = "✓✓"/);
  assert.match(chat, /textContent = "✓"/);
});

test("verification badges stay server-gated; compact + PNG-ready", () => {
  const verification = require("../havkar-verification.js");
  assert.equal(
    verification.serverVerifiedType({
      user_metadata: { verified: true, verification_type: "business" }
    }),
    ""
  );
  assert.equal(
    verification.serverVerifiedType({
      app_metadata: { verified: true, verification_type: "personal" }
    }),
    "personal"
  );
  const html = verification.renderBadgeHtml("business", { compact: true });
  assert.match(html, /havkar-badge business compact/);
  assert.match(html, /badge-business\.png/);
  assert.ok(!/havkar-badge-label/.test(html));
  const full = verification.renderBadgeHtml("company");
  assert.match(full, /Verified Company \/ Factory/);
  assert.match(full, /badge-company\.png/);
});

test("21-lang packs include message status + verification badge phrases", () => {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(read("havkar-ui-i18n21.js"), ctx);
  const api = ctx.HAVKAR_UI_I18N21;
  assert.ok(api && typeof api.pack === "function");
  const langs = [
    "en",
    "it",
    "de",
    "fr",
    "es",
    "pt",
    "nl",
    "sv",
    "pl",
    "id",
    "zh",
    "ja",
    "ko",
    "hi",
    "ru",
    "ckb",
    "kmr",
    "tr",
    "ar",
    "fa",
    "ur"
  ];
  const keys = [
    "Sent",
    "Delivered",
    "Read",
    "Verified Person",
    "Verified Business",
    "Verified Company / Factory",
    "Voice call",
    "Video call"
  ];
  // "Messenger" may remain a loanword in several locales by design.
  for (const lang of langs) {
    const pack = api.pack(lang) || {};
    if (lang !== "en") {
      assert.ok(pack.Messenger && String(pack.Messenger).trim(), `${lang} missing Messenger`);
    }
    for (const key of keys) {
      if (lang === "en") continue;
      assert.ok(
        pack[key] && String(pack[key]).trim(),
        `${lang} missing ${key}`
      );
      assert.notEqual(pack[key], key, `${lang} untranslated ${key}`);
    }
  }
});

test("no finance/payment files touched by this feature surface", () => {
  assert.ok(fs.existsSync(path.join(root, "havkar-verification.js")));
  assert.ok(fs.existsSync(path.join(root, "havkar-verification-badges.css")));
  assert.ok(fs.existsSync(path.join(root, "assets/icons/verification/README.md")));
});
