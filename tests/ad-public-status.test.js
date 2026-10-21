"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const publish = require("../havkar-ad-publish.js");
const root = path.join(__dirname, "..");

const visible = [null, undefined, "", "   ", "active", "Active", "ACTIVE"];
const hidden = ["draft", "hidden", "pending", "rejected", "inactive", "archived"];

visible.forEach(function (status) {
  assert.strictEqual(
    publish.isPublicListingStatus(status),
    true,
    "visible:" + String(status)
  );
});

hidden.forEach(function (status) {
  assert.strictEqual(
    publish.isPublicListingStatus(status),
    false,
    "hidden:" + status
  );
});

["buy-sell.html", "ads.html", "ad-details.html"].forEach(function (file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");

  assert.ok(
    source.includes('src="/havkar-ad-publish.js"'),
    file + " loads the shared publish helper"
  );
  assert.ok(
    source.includes("HAVKAR_AD_PUBLISH.isPublicListingStatus"),
    file + " uses the shared visibility rule"
  );
  assert.ok(
    source.includes("status === null"),
    file + " still treats a missing status as visible if the helper is absent"
  );
});

console.log("AD_PUBLIC_STATUS_TEST_OK");
