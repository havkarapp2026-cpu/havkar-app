import assert from "node:assert/strict";
import fs from "node:fs";

const chat = fs.readFileSync("chat.html", "utf8");
const adDetails = fs.readFileSync("ad-details.html", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20261113010000_listing_conversation_unique_rpc.sql",
  "utf8"
);

// BUG 1 — Android text selection vs reactions
assert.match(chat, /-webkit-user-select:\s*none/);
assert.match(chat, /-webkit-touch-callout:\s*none/);
assert.match(chat, /clearNativeTextSelection/);
assert.match(chat, /bindMessageLongPressReaction/);
assert.match(chat, /#messageInput[\s\S]{0,120}user-select:\s*text/);
assert.match(chat, /copyMessageText/);
assert.match(chat, /openReactionEmojiPicker/);
assert.doesNotMatch(chat, /reaction-trigger/);

// BUG 2 — Message Seller must bind listing + seller, never most-recent thread
assert.match(adDetails, /havkar_get_or_create_listing_conversation/);
assert.match(adDetails, /Conversation identity mismatch/);
assert.match(adDetails, /&ad_id=/);
assert.match(adDetails, /&seller_id=/);
assert.match(chat, /conversationMatchesRoute/);
assert.match(chat, /readChatRouteParams/);
assert.match(chat, /pageshow/);
assert.match(chat, /That chat does not match this listing seller/);
assert.match(chat, /Conversation identity mismatch/);

assert.match(migration, /conversations_ad_buyer_seller_uidx/);
assert.match(migration, /havkar_get_or_create_listing_conversation/);
assert.match(migration, /Cannot message yourself about your own listing/);
assert.match(migration, /listing\.user_id/);

// Guard: do not regress checkout while fixing chat
assert.doesNotMatch(adDetails, /xlmQuoteButton/);
assert.match(adDetails, /buyNowPanel/);

console.log("CHAT_REACT_ROUTING_TEST_OK");
