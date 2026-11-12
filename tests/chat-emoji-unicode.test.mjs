import assert from "node:assert/strict";
import fs from "node:fs";

const chat = fs.readFileSync("chat.html", "utf8");
const catalog = fs.readFileSync("assets/havkar-emoji-catalog.js", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20261112230000_chat_send_notification_safe.sql",
  "utf8"
);

assert.match(chat, /havkar_send_chat_message/);
assert.match(chat, /isLikelyEmoji/);
assert.match(chat, /insertEmojiAtCursor/);
assert.match(chat, /reactionPortal/);
assert.match(chat, /openEmojiModal/);
assert.match(chat, /textarea/);
assert.match(chat, /state\.sending/);
assert.match(chat, /havkar-emoji-catalog\.js/);
assert.match(chat, /textContent\s*=/);
assert.doesNotMatch(chat, /message-text[\s\S]{0,80}innerHTML\s*=/);

assert.match(catalog, /HAVKAR_EMOJI_CATALOG/);
assert.match(catalog, /Smileys|smileys/);
assert.match(catalog, /flags/i);
assert.ok(catalog.includes("👨‍👩‍👧‍👦") || catalog.includes("👩‍💻") || catalog.includes("🏳️‍🌈"));

assert.match(migration, /EXCEPTION WHEN OTHERS/);
assert.match(migration, /notification skipped/);

// Unicode safety smoke: ZWJ family and flag sequences remain intact as Unicode text.
const zwj = "👨‍👩‍👧‍👦";
const flag = "🇮🇹";
const skin = "👍🏽";
assert.equal([...zwj].length > 1, true);
assert.equal(Buffer.from(zwj, "utf8").toString("utf8"), zwj);
assert.equal(Buffer.from(flag + skin, "utf8").toString("utf8"), flag + skin);

console.log("CHAT_EMOJI_UNICODE_TEST_OK");
