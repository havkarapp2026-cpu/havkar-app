import assert from "node:assert/strict";
import fs from "node:fs";

const chat = fs.readFileSync("chat.html", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20261113090000_message_reactions_emoji_allowlist_fix.sql",
  "utf8"
);

assert.match(chat, /const REACTIONS = \[[\s\S]*?🙏[\s\S]*?🔥[\s\S]*?👏[\s\S]*?🎉/);
assert.match(chat, /reactionInFlight/);
assert.match(chat, /ignoreDuplicates:\s*false/);
assert.match(chat, /onConflict:\s*"message_id,user_id"/);
assert.match(chat, /Reaction could not be saved/);
assert.match(chat, /isLikelyEmoji/);
assert.match(chat, /reactionPortal/);
assert.doesNotMatch(chat, /checkout\.html|stripe|xlm/i);

assert.match(migration, /havkar_is_reaction_emoji/);
assert.match(migration, /Users can add reactions in their conversations/);
assert.match(migration, /Users can update their own reactions/);
assert.match(migration, /auth\.uid\(\)\s*=\s*user_id/);
assert.match(migration, /buyer_id|seller_id/);
assert.doesNotMatch(
  migration,
  /ARRAY\s*\[\s*'❤️'::text,\s*'😂'::text,\s*'😍'::text,\s*'👍'::text,\s*'😢'::text,\s*'😡'::text\s*\]/
);
assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY|FORCE ROW LEVEL SECURITY/);

console.log("CHAT_REACTION_SAVE_FIX_TEST_OK");
