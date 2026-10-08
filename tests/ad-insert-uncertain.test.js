"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const publish = require("../havkar-ad-publish.js");

const root = path.join(__dirname, "..");
const postAd = fs.readFileSync(path.join(root, "post-ad.html"), "utf8");
const ads = fs.readFileSync(path.join(root, "ads.html"), "utf8");

function rejected(status, code, message) {
  return publish.classifyInsertResult({
    data: null,
    error: {
      message: message,
      code: code || ""
    },
    status: status
  });
}

const uncertainMessage = publish.UNCERTAIN_PUBLISH_MESSAGE;

assert.ok(
  uncertainMessage.indexOf("may still be published") !== -1
);
assert.ok(
  uncertainMessage.indexOf("Do not submit it again") !== -1
);
assert.ok(
  !/not saved|was not saved|timed out|try again/i.test(uncertainMessage)
);

[
  { error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 },
  null,
  undefined,
  "no response",
  { error: { message: "gateway", code: "" }, status: 502 },
  { error: { message: "timeout", code: "" }, status: 408 },
  { error: { message: "missing status" } }
].forEach(function (result) {
  const outcome = publish.classifyInsertResult(result);
  assert.strictEqual(outcome.outcome, "uncertain");
  assert.strictEqual(outcome.claimNotSaved, false);
  assert.strictEqual(outcome.allowRetry, false);
  assert.strictEqual(outcome.message, uncertainMessage);
});

const thrown = publish.classifyInsertResult({
  error: new TypeError("Failed to fetch"),
  status: 0
});
assert.strictEqual(thrown.outcome, "uncertain");
assert.strictEqual(thrown.allowRetry, false);

[
  rejected(403, "42501", "new row violates row-level security policy"),
  rejected(406, "PGRST116", "JSON object requested, multiple (or no) rows returned"),
  rejected(400, "", "invalid input")
].forEach(function (outcome) {
  assert.strictEqual(outcome.outcome, "rejected");
  assert.strictEqual(outcome.claimNotSaved, true);
  assert.strictEqual(outcome.allowRetry, true);
});

const saved = publish.classifyInsertResult({
  data: null,
  error: null,
  status: 201
});
assert.strictEqual(saved.outcome, "saved");
assert.strictEqual(saved.allowRetry, false);

const guard = publish.createPostingGuard();
assert.strictEqual(guard.beginPublish(), true);
assert.strictEqual(guard.phase(), "publishing");
assert.strictEqual(guard.beginPublish(), null);
assert.strictEqual(guard.canSubmit(), false);

const firstUncertain = guard.markUncertain();
assert.strictEqual(firstUncertain.changed, true);
assert.strictEqual(firstUncertain.allowRetry, false);
const secondUncertain = guard.markUncertain();
assert.strictEqual(secondUncertain.changed, false);
assert.strictEqual(guard.phase(), "uncertain");
assert.strictEqual(guard.beginPublish(), null);
assert.strictEqual(guard.releaseAfterSave(), false);
assert.strictEqual(guard.markSaved(), true);
assert.strictEqual(guard.releaseAfterSave(), true);
assert.strictEqual(guard.phase(), "idle");
assert.strictEqual(guard.canSubmit(), true);

const retryGuard = publish.createPostingGuard();
assert.strictEqual(retryGuard.beginPublish(), true);
assert.strictEqual(retryGuard.markFailed(), true);
assert.strictEqual(retryGuard.phase(), "idle");
assert.strictEqual(retryGuard.canSubmit(), true);

function assertPublishFlow(source, label) {
  assert.ok(
    source.indexOf("/havkar-ad-publish.js") !== -1,
    label + " loads the publish guard"
  );
  assert.ok(
    source.indexOf("/havkar-ad-images.js") !== -1,
    label + " loads Storage uploads"
  );
  assert.ok(
    source.indexOf("uploadAdvertisementImages") !== -1,
    label + " uploads new images to Storage"
  );
  assert.ok(
    source.indexOf("HAVKAR_AD_PUBLISH.classifyInsertResult") !== -1,
    label + " classifies inserts with the merged publish guard"
  );
  assert.strictEqual(
    source.indexOf("Promise.race"),
    -1,
    label + " must not race the INSERT against a timeout"
  );
  assert.strictEqual(
    source.indexOf(
      "The publish request timed out. Please check your internet connection and try again."
    ),
    -1,
    label + " must not claim a timeout means the advertisement was not saved"
  );

  const beginAt = source.indexOf("beginPublish(");
  const insertAt = source.lastIndexOf(".insert(");
  const classifyAt = source.indexOf("classifyInsertResult(");
  const uncertainAt = source.indexOf('outcome.outcome === "uncertain"');
  const failedAt = source.lastIndexOf("markFailed(");

  assert.ok(beginAt !== -1 && beginAt < insertAt, label + " locks before INSERT");
  assert.ok(classifyAt > insertAt, label + " classifies the INSERT result");
  assert.ok(
    uncertainAt > classifyAt && uncertainAt < failedAt,
    label + " handles an uncertain result before a confirmed failure"
  );
}

assertPublishFlow(postAd, "post-ad.html");
assertPublishFlow(ads, "ads.html");

const buySell = fs.readFileSync(path.join(root, "buy-sell.html"), "utf8");
const details = fs.readFileSync(path.join(root, "ad-details.html"), "utf8");
assert.ok(buySell.indexOf("data:image/") !== -1);
assert.ok(details.indexOf("data:image/") !== -1);
assert.ok(ads.indexOf("readAsDataURL(") !== -1);
assert.ok(ads.indexOf("selectedImageData") !== -1);
assert.ok(ads.indexOf('outcome.outcome === "rejected"') !== -1);
assert.ok(postAd.indexOf('outcome.outcome === "rejected"') !== -1);
assert.ok(ads.indexOf("releaseAfterSave(") !== -1);
assert.ok(
  ads.indexOf("markSaved(") !== -1 &&
  ads.indexOf("markSaved(") < ads.indexOf("releaseAfterSave(")
);
assert.ok(postAd.indexOf("markSaved(") !== -1);
assert.ok(postAd.indexOf("publishBtn.disabled =\n        false;") !== -1);

console.log("AD_INSERT_UNCERTAIN_TEST_OK");
