const assert = require("assert");
const fs = require("fs");
const path = require("path");
const handler = require("../api/translate.js");

const root = path.join(__dirname, "..");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

assert.strictEqual(handler.havkarLanguageCode("ku"), "kmr");
assert.strictEqual(handler.havkarLanguageCode("kmr"), "kmr");
assert.strictEqual(handler.havkarLanguageCode("ckb"), "ckb");
assert.strictEqual(handler.googleLanguageCode("kmr"), "ku");
assert.strictEqual(handler.googleLanguageCode("ku"), "ku");
assert.strictEqual(handler.googleLanguageCode("ckb"), "ckb");

const chat = read("chat.html");
const translate = read("translate.html");
const i18n = read("havkar-i18n.js");

assert.ok(chat.includes('value="ckb"'));
assert.ok(chat.includes('value="kmr"'));
assert.ok(!chat.includes('value="ku"'));
assert.ok(chat.includes('savedTarget === "ku"'));

assert.ok(translate.includes('value="ckb"'));
assert.ok(translate.includes('value="kmr"'));
assert.ok(!translate.includes('value="ku"'));

assert.ok(i18n.includes('code: "ckb"'));
assert.ok(i18n.includes('code: "kmr"'));

const delivery = read("delivery.html");
assert.ok(!delivery.includes('ckb:"fa"'));
assert.ok(!delivery.includes('ku:"fa"'));
assert.ok(!delivery.includes('kmr:"fa"'));
assert.ok(delivery.includes('["fa","ar","ckb"]'));

console.log("KURDISH_LANGUAGE_TEST_OK");
