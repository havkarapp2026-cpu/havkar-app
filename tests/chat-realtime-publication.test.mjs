import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(
  "supabase/migrations/20261022013000_publish_chat_messages_realtime.sql",
  "utf8"
);

assert.match(sql, /ALTER TABLE public\.messages REPLICA IDENTITY FULL/);
assert.match(
  sql,
  /ALTER PUBLICATION supabase_realtime ADD TABLE public\.messages/
);
assert.match(sql, /pubname = 'supabase_realtime'/);
assert.match(sql, /tablename = 'messages'/);
assert.doesNotMatch(sql, /ADD TABLE public\.conversations/);
assert.doesNotMatch(sql, /INSERT INTO/i);
assert.doesNotMatch(sql, /UPDATE public\.messages/i);
assert.doesNotMatch(sql, /wallet|stellar|pi_network/i);

console.log("CHAT_REALTIME_PUBLICATION_TEST_OK");
