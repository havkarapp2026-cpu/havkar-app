import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

for (const name of ["privacy.html", "terms.html"]) {
  const html = read(name);
  assert.match(html, /Draft for the HAVKAR owner and legal counsel/);
  assert.match(html, /not a certification|not a final contract/);
  assert.match(html, /privacy-request\.html/);
  assert.match(html, /dir="rtl"/);
  assert.equal(html.includes("icon.png"), false, name);
}

assert.match(read("signup.html"), /href="privacy\.html"/);
assert.match(read("signup.html"), /href="terms\.html"/);
assert.match(read("login.html"), /href="privacy\.html"/);
assert.match(read("login.html"), /href="terms\.html"/);
assert.match(read("support.html"), /href="privacy\.html"/);
assert.match(read("support.html"), /href="terms\.html"/);
assert.match(read("about.html"), /href="privacy\.html"/);
assert.match(read("privacy-request.html"), /does not delete the account/);
assert.match(read("privacy.html"), /Processors observed in the current system/);
assert.match(read("privacy.html"), /eu-west-1/);
assert.match(read("privacy.html"), /generativelanguage\.googleapis\.com/);
assert.match(read("privacy.html"), /Items still blank for the owner and counsel/);
assert.match(read("privacy.html"), /persistSession/);
assert.doesNotMatch(read("privacy.html"), /Partita|sk_live_|service_role|standard contractual clauses are in place|adequacy decision is confirmed/);
assert.doesNotMatch(read("terms.html"), /Partita|sk_live_|service_role/);

console.log("LEGAL_DRAFTS_TEST_OK");
