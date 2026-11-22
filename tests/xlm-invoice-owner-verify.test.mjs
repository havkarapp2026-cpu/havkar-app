import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const invoicePage = fs.readFileSync(path.join(root, "xlm-invoice.html"), "utf8");
const api = fs.readFileSync(path.join(root, "api/create-event-checkout.js"), "utf8");

assert.match(invoicePage, /Verify Payment/);
assert.match(invoicePage, /can_verify/);
assert.match(invoicePage, /havkar-supabase-config\.js/);
assert.match(invoicePage, /action:\s*"verify"/);
assert.match(invoicePage, /payment_method:\s*"xlm"/);
assert.match(invoicePage, /Authorization:\s*"Bearer "/);
assert.equal(invoicePage.includes("service_role"), false);
assert.equal(invoicePage.includes("SERVICE_ROLE"), false);
assert.equal(/access_token\s*\+|token\.slice|console\.log\([^\)]*accessToken/.test(invoicePage), false);

assert.match(api, /can_verify/);
assert.match(api, /authenticateUser\(req\)/);
assert.match(api, /String\(auth\.user\.id\) === String\(intent\.user_id\)/);
assert.match(api, /user_id,flow,amount/);
assert.equal(api.includes("can_verify: true,\n    user_id"), false);

console.log("XLM_INVOICE_OWNER_VERIFY_TEST_OK");
