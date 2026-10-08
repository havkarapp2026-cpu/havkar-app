const assert = require("node:assert/strict");
const fs = require("node:fs");
const images = require("../havkar-ad-images.js");

const OWNER =
  "11111111-1111-4111-8111-111111111111";

const OTHER =
  "22222222-2222-4222-8222-222222222222";

const PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

function imageBlob(type, signature, size) {
  const length = size || Math.max(signature.length, 32);
  const bytes = new Uint8Array(length);
  bytes.set(signature);
  return new Blob([bytes], { type: type });
}

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

function fakeClient(onUpload) {
  const calls = [];
  return {
    calls: calls,
    storage: {
      from(bucket) {
        calls.push({ op: "from", bucket: bucket });
        return {
          async upload(path, body, options) {
            calls.push({
              op: "upload",
              path: path,
              type: body && body.type,
              options: options
            });
            if (onUpload) {
              return onUpload(path, body, options, calls);
            }
            return { data: { path: path }, error: null };
          },
          getPublicUrl(path) {
            calls.push({ op: "public", path: path });
            return {
              data: {
                publicUrl:
                  "https://project.supabase.co/storage/v1/object/public/ad-images/" +
                  path
              }
            };
          },
          remove() {
            throw new Error("delete must not be called");
          }
        };
      }
    }
  };
}

async function rejects(fn) {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

async function main() {
  const source = fs.readFileSync(
    require("node:path").join(__dirname, "../havkar-ad-images.js"),
    "utf8"
  );
  const postAd = fs.readFileSync(
    require("node:path").join(__dirname, "../post-ad.html"),
    "utf8"
  );
  const adsPage = fs.readFileSync(
    require("node:path").join(__dirname, "../ads.html"),
    "utf8"
  );
  assert.equal(source.includes("service_role"), false);
  assert.equal(source.includes(".remove("), false);
  assert.equal(source.includes("upsert: true"), false);
  assert.equal(source.includes("data:image"), false);
  assert.equal(postAd.includes("service_role"), false);
  assert.equal(adsPage.includes("service_role"), false);

  function scriptOrder(html, names) {
    let previous = -1;
    names.forEach(name => {
      const index = html.indexOf(name);
      assert.equal(index > previous, true, name);
      previous = index;
    });
  }

  scriptOrder(postAd, [
    "@supabase/supabase-js@2",
    "/havkar-supabase-config.js",
    "/havkar-countries.js",
    "/havkar-ad-images.js",
    "uploadAdvertisementImages",
    "/havkar-i18n.js"
  ]);
  scriptOrder(adsPage, [
    "@supabase/supabase-js@2",
    "/havkar-supabase-config.js",
    "/havkar-ad-images.js",
    "uploadAdvertisementImages",
    "/havkar-i18n.js"
  ]);
  assert.equal(postAd.includes("supabaseClient,\n          currentUser.id"), true);
  assert.equal(adsPage.includes("supabaseClient,\n                            currentUserId"), true);
  assert.equal(postAd.includes("photos.length !== preparedPhotos.length"), true);
  assert.equal(adsPage.includes("uploadedUrls.length !== 1"), true);

  const policyPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/i;

  const client = fakeClient();
  const urls = await images.uploadAdvertisementImages(
    client,
    OWNER.toUpperCase(),
    [
      imageBlob("image/jpeg", JPEG),
      imageBlob("image/png", PNG),
      imageBlob("", WEBP)
    ]
  );

  assert.equal(urls.length, 3);
  assert.equal(client.calls.filter(call => call.op === "upload").length, 3);
  const paths = client.calls
    .filter(call => call.op === "upload")
    .map(call => call.path);
  assert.equal(new Set(paths).size, 3);
  paths.forEach(path => {
    assert.match(path, PATH_PATTERN);
    assert.match(path, policyPattern);
    assert.equal(path.split("/").length, 2);
    assert.equal(path.startsWith(OWNER + "/"), true);
  });
  assert.deepEqual(
    client.calls.filter(call => call.op === "upload").map(call => call.type),
    ["image/jpeg", "image/png", "image/webp"]
  );

  const aliasClient = fakeClient();
  await images.uploadAdvertisementImages(aliasClient, OWNER, [
    imageBlob("image/jpg", JPEG),
    imageBlob("", WEBP)
  ]);
  assert.deepEqual(
    aliasClient.calls.filter(call => call.op === "upload").map(call => call.type),
    ["image/jpeg", "image/webp"]
  );
  client.calls.filter(call => call.op === "upload").forEach(call => {
    assert.equal(call.options.upsert, false);
    assert.equal(
      ["image/jpeg", "image/png", "image/webp"].includes(call.options.contentType),
      true
    );
    assert.equal(call.options.cacheControl, "3600");
  });
  urls.forEach((url, index) => {
    assert.equal(url.startsWith("https://"), true);
    assert.equal(url.includes("/storage/v1/object/public/ad-images/" + paths[index]), true);
    assert.equal(url.startsWith("data:"), false);
  });

  const anonClient = fakeClient();
  const anonError = await rejects(() =>
    images.uploadAdvertisementImages(anonClient, "", [imageBlob("image/jpeg", JPEG)])
  );
  assert.equal(anonError.code, "AUTH");
  assert.equal(anonClient.calls.length, 0);

  const gifClient = fakeClient();
  const gifError = await rejects(() =>
    images.uploadAdvertisementImages(gifClient, OWNER, [imageBlob("image/gif", GIF)])
  );
  assert.equal(gifError.code, "TYPE");
  assert.equal(gifClient.calls.filter(call => call.op === "upload").length, 0);

  const mismatch = await rejects(() =>
    images.validateAdImage(imageBlob("image/jpeg", PNG))
  );
  assert.equal(mismatch.code, "TYPE");

  const tooBig = await rejects(() =>
    images.validateAdImage(imageBlob("image/jpeg", JPEG, images.MAX_BYTES + 1))
  );
  assert.equal(tooBig.code, "SIZE");

  const exact = await images.validateAdImage(
    imageBlob("image/jpeg", JPEG, images.MAX_BYTES)
  );
  assert.equal(exact.contentType, "image/jpeg");
  assert.equal(exact.extension, "jpg");

  let uploads = 0;
  const partialClient = fakeClient(() => {
    uploads += 1;
    if (uploads === 2) {
      return { data: null, error: { message: "denied" } };
    }
    return { data: { path: "ok" }, error: null };
  });
  const partial = await rejects(() =>
    images.uploadAdvertisementImages(partialClient, OWNER, [
      imageBlob("image/jpeg", JPEG),
      imageBlob("image/png", PNG),
      imageBlob("image/webp", WEBP)
    ])
  );
  assert.equal(partial.orphans.length, 1);
  assert.equal(partial.orphans[0].includes(paths[0].split("/")[0]), true);
  assert.equal(partial.orphans[0].startsWith("https://"), true);
  assert.equal(uploads, 2);
  assert.equal(partial.message.includes("was not saved"), true);

  const interruptedClient = fakeClient(() => {
    throw new Error("socket closed");
  });
  const interrupted = await rejects(() =>
    images.uploadAdvertisementImages(
      interruptedClient,
      OWNER,
      [imageBlob("image/jpeg", JPEG)]
    )
  );
  assert.equal(interrupted.orphans.length, 0);
  assert.equal(interrupted.unconfirmed.length, 1);
  assert.match(interrupted.unconfirmed[0], PATH_PATTERN);
  assert.equal(interrupted.message.includes("was not saved"), true);

  const saveError = images.incompleteSaveError(
    new Error("permission denied"),
    urls
  );
  assert.equal(saveError.orphans.length, 3);
  assert.equal(saveError.message.includes("was not saved"), true);
  assert.equal(saveError.message.includes("permission denied"), true);

  const crossUser = images.normalizeUserId(OTHER);
  assert.notEqual(crossUser, OWNER);
  const crossClient = fakeClient();
  const crossUrls = await images.uploadAdvertisementImages(
    crossClient,
    OTHER,
    [imageBlob("image/webp", WEBP)]
  );
  assert.equal(crossUrls[0].includes("/" + OTHER + "/"), true);
  assert.equal(crossUrls[0].includes("/" + OWNER + "/"), false);

  const selection = images.createPostingGuard();
  const accepted = [];
  assert.equal(selection.beginValidation(), true);
  assert.equal(selection.canSubmit(), false);
  assert.equal(selection.beginPublish(accepted), null);
  accepted.push("photo-a", "photo-b");
  selection.endValidation();
  assert.equal(selection.canSubmit(), true);
  const publishFiles = selection.beginPublish(accepted);
  accepted.splice(0, 1);
  accepted.push("photo-c");
  assert.deepEqual(publishFiles, ["photo-a", "photo-b"]);
  assert.equal(selection.canEditImages(), false);
  assert.equal(selection.beginPublish(["other"]), null);

  const removal = images.createPostingGuard();
  const liveFiles = ["keep", "remove-me", "next"];
  const stableFiles = removal.beginPublish(liveFiles);
  liveFiles.splice(1, 1);
  assert.deepEqual(stableFiles, ["keep", "remove-me", "next"]);
  assert.equal(removal.canEditImages(), false);
  assert.equal(removal.beginValidation(), false);

  const timeoutGuard = images.createPostingGuard();
  assert.equal(timeoutGuard.beginPublish(["only"]).length, 1);
  const uncertain = timeoutGuard.markUncertain();
  assert.equal(uncertain.changed, true);
  assert.equal(uncertain.claimNotSaved, false);
  assert.equal(uncertain.allowRetry, false);
  assert.equal(/not saved|was not saved|timed out/i.test(uncertain.message), false);
  assert.equal(timeoutGuard.canSubmit(), false);
  assert.equal(timeoutGuard.beginPublish(["again"]), null);
  assert.equal(/not saved|was not saved/i.test(timeoutGuard.blockedMessage()), false);
  assert.equal(timeoutGuard.markSaved(), true);
  assert.equal(timeoutGuard.canSubmit(), false);
  assert.equal(timeoutGuard.markUncertain().changed, false);
  assert.equal(timeoutGuard.beginPublish(["after-save"]), null);

  const failedAfterWait = images.createPostingGuard();
  failedAfterWait.beginPublish(["pending"]);
  failedAfterWait.markUncertain();
  assert.equal(failedAfterWait.markFailed(), true);
  assert.equal(failedAfterWait.phase(), "idle");
  assert.deepEqual(failedAfterWait.beginPublish(["new-attempt"]), ["new-attempt"]);

  const settledFirst = images.createPostingGuard();
  settledFirst.beginPublish(["done"]);
  assert.equal(settledFirst.markSaved(), true);
  const lateTimeout = settledFirst.markUncertain();
  assert.equal(lateTimeout.changed, false);
  assert.equal(lateTimeout.claimNotSaved, false);
  assert.equal(lateTimeout.allowRetry, false);

  const picker = images.createImageSelection();
  const older = picker.begin("older");
  assert.equal(picker.canPublish(), false);
  assert.equal(picker.selectedFile(), null);
  const newer = picker.begin("newer");
  assert.equal(picker.succeed(older, "older"), false);
  assert.equal(picker.selectedFile(), null);
  assert.equal(picker.canPublish(), false);
  assert.equal(picker.succeed(newer, "newer"), true);
  assert.equal(picker.selectedFile(), "newer");
  assert.equal(picker.canPublish(), true);
  const rejectedPick = picker.begin("bad");
  assert.equal(picker.fail(newer), false);
  assert.equal(picker.isPending(), true);
  assert.equal(picker.fail(rejectedPick), true);
  assert.equal(picker.selectedFile(), null);
  assert.equal(picker.canPublish(), true);

  const changeStart = postAd.indexOf("photoInput.addEventListener");
  const submitStart = postAd.indexOf("adForm.addEventListener");
  const changeBlock = postAd.slice(changeStart, submitStart);
  assert.equal(changeBlock.indexOf("beginValidation") < changeBlock.indexOf("validateAdImage"), true);
  assert.equal(changeBlock.indexOf("endValidation") > changeBlock.indexOf("validateAdImage"), true);
  const publishBlock = postAd.slice(submitStart);
  assert.equal(publishBlock.indexOf("beginPublish") < publishBlock.indexOf("getCurrentUser"), true);
  assert.equal(publishBlock.includes("i < filesToPublish.length"), true);
  assert.equal(publishBlock.includes("i < selectedFiles.length"), false);
  assert.equal(publishBlock.includes("Promise.race"), false);
  assert.equal(publishBlock.includes("The publish request timed out"), false);
  assert.equal(publishBlock.includes("markUncertain"), true);
  assert.equal(publishBlock.includes("await insertPromise"), true);
  const removeStart = postAd.indexOf("removeBtn.onclick");
  const removeBlock = postAd.slice(removeStart, removeStart + 500);
  assert.equal(removeBlock.indexOf("canEditImages") < removeBlock.indexOf("splice"), true);

  const previewStart = adsPage.indexOf("async function previewImage");
  const previewBlock = adsPage.slice(previewStart, previewStart + 3500);
  assert.equal(previewBlock.indexOf("adImageSelection.begin") < previewBlock.indexOf("validateAdImage"), true);
  assert.equal(previewBlock.includes("adImageSelection.succeed"), true);
  assert.equal(previewBlock.includes("adImageSelection.fail"), true);
  const submitAdStart = adsPage.indexOf("async function submitAd");
  const submitAdBlock = adsPage.slice(submitAdStart, previewStart);
  assert.equal(submitAdBlock.indexOf("canPublish") < submitAdBlock.indexOf("getSession"), true);
  assert.equal(submitAdBlock.indexOf("imageToPublish") < submitAdBlock.indexOf("getSession"), true);
  assert.equal(submitAdBlock.includes("[\n                                imageToPublish\n                            ]"), true);
  assert.equal(submitAdBlock.includes("selectedImageFile"), false);

  console.log("AD_IMAGE_UPLOAD_TEST_OK");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
