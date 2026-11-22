import assert from "node:assert/strict";
import fs from "node:fs";

const chat = fs.readFileSync("chat.html", "utf8");

assert.match(chat, /emoji-sheet-chrome/);
assert.match(chat, /emoji-sheet-note/);
assert.match(chat, /scrollEmojiGridToCategory/);
assert.match(chat, /emoji-section-/);
assert.match(chat, /min-height:\s*0/);
assert.match(chat, /flex:\s*1\s+1\s+auto/);
assert.match(chat, /emoji-sticky-tabs-v6/);

// Chrome stays fixed; only the grid scrolls.
const chromeIdx = chat.indexOf(".emoji-sheet-chrome");
const gridIdx = chat.indexOf(".emoji-grid{");
assert.ok(chromeIdx > 0 && gridIdx > chromeIdx);
const chromeCss = chat.slice(chromeIdx, chromeIdx + 220);
const gridCss = chat.slice(gridIdx, gridIdx + 420);
assert.match(chromeCss, /flex:\s*0\s+0\s+auto/);
assert.match(chromeCss, /z-index:\s*3/);
assert.match(gridCss, /overflow-y:\s*auto/);
assert.match(gridCss, /min-height:\s*0/);

// Category tap still highlights + scrolls; search/recent preserved.
assert.match(chat, /aria-selected/);
assert.match(chat, /Recently used/);
assert.match(chat, /readRecentEmojis/);
assert.match(chat, /openReactionEmojiPicker|emojiPickerMode/);

// Do not regress messaging/checkout markers.
assert.match(chat, /havkar_send_chat_message/);
assert.match(chat, /conversationMatchesRoute/);
assert.doesNotMatch(chat, /buyNowPanel/);

console.log("EMOJI_PICKER_STICKY_TABS_TEST_OK");
