import assert from "node:assert/strict";
import fs from "node:fs";

const chat = fs.readFileSync("chat.html", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20261112220000_chat_send_realtime_push.sql",
  "utf8"
);
const notifyApi = fs.readFileSync("lib/havkar-chat-notify-api.cjs", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");

assert.match(chat, /havkar_send_chat_message/);
assert.match(chat, /TRANSLATION_LANGUAGES/);
assert.match(chat, /openLanguageModal/);
assert.match(chat, /ckb/);
assert.match(chat, /kmr/);
assert.match(chat, /subscribeInboxRealtime/);
assert.match(chat, /bumpInboxFromMessage/);
assert.match(chat, /showSendRetry/);
assert.match(chat, /skipTranslate/);
assert.match(chat, /client_message_id|p_client_message_id/);
assert.match(chat, /ensurePushRegistration/);
assert.match(chat, /reaction-open/);
assert.doesNotMatch(chat, /<select[\s\S]*translationTargetLanguage/);

assert.match(migration, /havkar_send_chat_message/);
assert.match(migration, /havkar_push_device_tokens/);
assert.match(migration, /client_message_id/);
assert.match(migration, /ADD TABLE public\.conversations/);

assert.match(notifyApi, /notify_message/);
assert.match(notifyApi, /HAVKAR_VAPID_PUBLIC_KEY/);
assert.match(notifyApi, /guaranteed: false/);

assert.match(sw, /addEventListener\("push"/);
assert.match(sw, /notificationclick/);

assert.match(vercel, /chat-notify/);
assert.match(
  fs.readFileSync("api/create-event-checkout.js", "utf8"),
  /isChatNotifyRequest/
);

console.log("CHAT_MESSAGING_FIX_TEST_OK");
