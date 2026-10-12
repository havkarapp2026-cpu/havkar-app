"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const back = require("../havkar-page-back.js");

const origin = "https://havkar-app.vercel.app";

assert.strictEqual(
  back.havkarBackDestination(origin + "/buy-sell.html", origin + "/index.html"),
  "index.html"
);

assert.strictEqual(
  back.havkarBackDestination(origin + "/buy-sell.html", origin + "/"),
  "index.html"
);

assert.strictEqual(
  back.havkarBackDestination(origin + "/buy-sell.html", origin + "/profile.html?tab=saved"),
  "profile.html?tab=saved"
);

assert.strictEqual(
  back.havkarBackDestination(origin + "/buy-sell.html", "https://evil.example/index.html"),
  "index.html"
);

assert.strictEqual(
  back.havkarBackDestination(origin + "/buy-sell.html", ""),
  "index.html"
);

assert.strictEqual(
  back.havkarBackDestination(origin + "/buy-sell.html", origin + "/buy-sell.html"),
  "index.html"
);

assert.strictEqual(
  back.havkarBackDestination(origin + "/buy-sell.html", origin + "/api/job-checkout"),
  "index.html"
);

const page = fs.readFileSync(path.join(__dirname, "../buy-sell.html"), "utf8");
assert.strictEqual(page.includes("history.length"), false);
assert.strictEqual(page.includes("history.back"), false);
assert.strictEqual(page.includes("HAVKAR_PAGE_BACK"), true);
assert.strictEqual(page.includes("havkarBackDestination"), true);
