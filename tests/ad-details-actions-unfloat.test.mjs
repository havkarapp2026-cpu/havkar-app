import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync("ad-details.html", "utf8");

test("Message / Save / Report actions are not sticky or fixed over page content", () => {
  const actionsBlock = html.match(/\/\* ACTIONS[\s\S]*?\.action-button\{/);
  assert.ok(actionsBlock, "actions CSS block present");
  assert.match(actionsBlock[0], /\.actions\{[\s\S]*position:static/);
  assert.doesNotMatch(actionsBlock[0], /position:sticky/);
  assert.doesNotMatch(actionsBlock[0], /position:fixed/);
});

test("the three listing action buttons remain under the seller card once", () => {
  const sellerIdx = html.indexOf('class="seller-card"');
  const actionsIdx = html.indexOf('class="actions"');
  const messageIdx = html.indexOf('id="messageButton"');
  const saveIdx = html.indexOf('id="saveButton"');
  const reportIdx = html.indexOf('id="reportButton"');
  assert.ok(sellerIdx > 0 && actionsIdx > sellerIdx);
  assert.ok(messageIdx > actionsIdx && saveIdx > actionsIdx && reportIdx > actionsIdx);
  assert.equal((html.match(/id="messageButton"/g) || []).length, 1);
  assert.equal((html.match(/id="saveButton"/g) || []).length, 1);
  assert.equal((html.match(/id="reportButton"/g) || []).length, 1);
});

test("Buy Now card and XLM controls stay present unchanged by this fix scope", () => {
  assert.match(html, /id="buyCardButton"/);
  assert.match(html, /id="buyXlmButton"/);
  assert.match(html, /Pay with card \(Stripe\)/);
});
