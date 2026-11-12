import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd());
const SCAN_DIRS = ["api", "lib", "scripts"];
const FORBIDDEN = [
  { name: "raw_test_pan_0077", re: /4000000000000077/ },
  { name: "tok_bypassPending", re: /tok_bypassPending/ },
  { name: "charges.create", re: /charges\.create\s*\(/ },
  { name: "payment_method_data_card_number", re: /payment_method_data[\s\S]{0,200}number\s*:/ },
  { name: "inline_cvc_field", re: /\bcvc\s*:\s*['"`]\d{3,4}['"`]/ }
];

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch (_err) {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.(js|cjs|mjs)$/.test(name)) continue;
    out.push(full);
  }
  return out;
}

test("payment code never submits raw PANs, tokens, or Charges API", () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
  assert.ok(files.length > 0, "expected payment source files to scan");
  const hits = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const rule of FORBIDDEN) {
      if (rule.re.test(text)) {
        hits.push(`${rule.name} in ${file.replace(ROOT + "/", "")}`);
      }
    }
  }
  assert.deepEqual(hits, [], `forbidden Stripe patterns found: ${hits.join("; ")}`);
});

test("sandbox e2e funds via PaymentMethod helpers only", () => {
  const payout = readFileSync(join(ROOT, "lib/stripe-sandbox-payout-e2e.cjs"), "utf8");
  const payment = readFileSync(join(ROOT, "lib/stripe-sandbox-payment-e2e.cjs"), "utf8");
  assert.match(payout, /pm_card_bypassPendingInternational/);
  assert.match(payment, /pm_card_visa/);
  assert.match(payment, /pm_card_chargeDeclined/);
  assert.doesNotMatch(payout, /charges\.create/);
  assert.doesNotMatch(payment, /charges\.create/);
  assert.doesNotMatch(payout, /tok_/);
  assert.doesNotMatch(payment, /tok_/);
});
