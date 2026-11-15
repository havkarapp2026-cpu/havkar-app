import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LANGUAGE_NAMES,
  TASK_LIMITS,
  assistantInstruction,
  validateAssistantRequest
} from "../supabase/functions/havkar-ai-assistant/policy.mjs";
import { markdownInlineParts } from "../havkar-ai-render.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(path.join(root, "havkar-ai.html"), "utf8");
const phrases = fs.readFileSync(path.join(root, "havkar-ai-phrases.js"), "utf8");
const bundled = fs.readFileSync(
  path.join(root, "supabase/functions/havkar-ai-assistant/index.bundled.ts"),
  "utf8"
);

assert.ok(TASK_LIMITS.new_idea, "new_idea must be a supported assistant task");
assert.ok(TASK_LIMITS.ideas, "Business Ideas task must remain");
assert.notEqual(
  assistantInstruction("English", "new_idea"),
  assistantInstruction("English", "ideas")
);
assert.match(assistantInstruction("English", "new_idea"), /New Idea/);
assert.match(assistantInstruction("English", "new_idea"), /refine or develop/i);
assert.match(assistantInstruction("English", "ideas"), /practical business ideas/);

for (const language of Object.keys(LANGUAGE_NAMES)) {
  const accepted = validateAssistantRequest({
    language,
    task: "new_idea",
    messages: [{ role: "user", content: "Invent one original idea for a neighbourhood service." }]
  });
  assert.equal(accepted.ok, true, "new_idea must accept language " + language);
  assert.equal(accepted.task, "new_idea");
  assert.match(assistantInstruction(accepted.languageName, "new_idea"), new RegExp(accepted.languageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

const refine = validateAssistantRequest({
  language: "fa",
  task: "new_idea",
  messages: [
    { role: "user", content: "یک ایده اصیل بساز" },
    { role: "assistant", content: "ایده اول" },
    { role: "user", content: "همین ایده را توسعه بده" }
  ]
});
assert.equal(refine.ok, true);
assert.equal(refine.task, "new_idea");

assert.match(page, /data-tool-button="new_idea"/);
assert.match(page, /data-tool-button="ideas"/);
assert.match(page, />New Idea</);
assert.match(page, />Business Ideas</);
assert.match(page, /new_idea: \{ messages: 12/);
assert.match(page, /Refine this idea/);
assert.match(page, /Develop this idea/);
assert.match(page, /labeledAction\("Refine this idea"\)/);
assert.match(page, /labeledAction\("Develop this idea"\)/);
assert.match(page, /labeledAction\("Copy"\)/);
assert.match(page, /labeledAction\("Regenerate"/);
assert.match(page, /refreshActionLabels/);
assert.match(page, /task: currentTool/);
assert.match(page, /from\("ai_messages"\)\.upsert/);
assert.match(page, /item\.task \|\| restoredTask/);
assert.match(page, /selectTool\(restoredTask\)/);
assert.doesNotMatch(page, /mockNewIdea|fakeNewIdea|MOCK_NEW_IDEA/i);

assert.match(phrases, /"New Idea"/);
assert.match(phrases, /ایده جدید/);
assert.match(phrases, /"Copy"/);
assert.match(phrases, /"Regenerate"/);
assert.match(phrases, /این ایده را اصلاح کن/);
assert.match(phrases, /بازتولید/);
assert.match(bundled, /new_idea:R/);
assert.match(bundled, /HAVKAR New Idea tool/);

assert.deepEqual(markdownInlineParts("Try **bold** and plain"), [
  { type: "text", text: "Try " },
  { type: "strong", text: "bold" },
  { type: "text", text: " and plain" }
]);
assert.deepEqual(markdownInlineParts("**عنوان** ایده"), [
  { type: "strong", text: "عنوان" },
  { type: "text", text: " ایده" }
]);
assert.match(fs.readFileSync(path.join(root, "havkar-ai-render.mjs"), "utf8"), /markdownInlineParts/);
assert.match(fs.readFileSync(path.join(root, "havkar-ai-render.mjs"), "utf8"), /createElement\("strong"\)/);

console.log("HAVKAR_AI_NEW_IDEA_TEST_OK");
