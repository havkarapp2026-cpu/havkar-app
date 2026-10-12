const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const icon = fs.readFileSync(path.join(root, "favicon.ico"));
const trade = fs.readFileSync(path.join(root, "trade.html"), "utf8");

assert.strictEqual(icon.readUInt16LE(0), 0);
assert.strictEqual(icon.readUInt16LE(2), 1);
assert.strictEqual(icon.readUInt16LE(4), 3);
assert.ok(icon.length < 20000);

assert.ok(trade.includes('id="tradeLoginPrompt"'));
assert.ok(trade.includes('href="login.html"'));
assert.ok(trade.includes("Please sign in before using Trade."));
assert.ok(trade.includes("function isMissingAuthSession"));
assert.ok(trade.includes("supabaseClient.auth.getSession()"));
assert.ok(trade.indexOf("supabaseClient.auth.getSession()") < trade.indexOf("supabaseClient.auth.getUser()"));
assert.ok(!trade.includes("Please log in before using Trade."));

const buttonStart = trade.indexOf("function updateTradeButton()");
const buttonEnd = trade.indexOf("function disableTradeButton(");
const button = trade.slice(buttonStart, buttonEnd);
const loginReturn = button.indexOf("Please Log In");
const unavailable = button.indexOf("Unavailable");
assert.ok(loginReturn > -1 && unavailable > loginReturn);

console.log("FAVICON_TRADE_LOGIN_TEST_OK");
