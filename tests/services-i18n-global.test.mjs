import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const i18nPath = path.join(root, "havkar-services-i18n.js");
const src = fs.readFileSync(i18nPath, "utf8");
assert.match(src, /fa:\s*true/);
assert.match(src, /Provider tools/);
assert.match(src, /Request refund/);

const sandbox = {
  window: {},
  globalThis: {},
  document: {
    documentElement: {},
    querySelectorAll: function () {
      return [];
    },
    addEventListener: function () {}
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox);
const pack = sandbox.HAVKAR_SERVICES_I18N;
assert.ok(pack);
const langs = ["en", "fa", "ckb", "kmr", "it", "sv", "ar", "ur"];
for (const lang of langs) {
  assert.ok(pack.PHRASES[lang], "missing lang " + lang);
  for (const key of pack.KEYS) {
    assert.ok(pack.PHRASES[lang][key], lang + " missing " + key);
  }
}
assert.equal(pack.RTL.fa, true);
assert.equal(!!pack.RTL.kmr, false);

const page = fs.readFileSync(path.join(root, "services.html"), "utf8");
assert.match(page, /loadConnectCountries/);
assert.match(page, /bindProviderOps/);
assert.match(page, /services_slot_check/);
assert.match(page, /services_refund_request/);
assert.match(page, /services_booking_message_send/);
assert.match(page, /newServiceLat/);

const staff = fs.readFileSync(path.join(root, "staff.html"), "utf8");
assert.match(staff, /services_staff_panel/);
assert.match(staff, /finance hidden/i);

console.log("services-i18n-global.test.mjs: OK");
