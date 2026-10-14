const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const photos = require("../havkar-profile-photo.js");

const OWNER =
  "11111111-1111-4111-8111-111111111111";

const OTHER =
  "22222222-2222-4222-8222-222222222222";

const BASE =
  "https://gispovnciifgikvgpzck.supabase.co";

const CANONICAL =
  BASE +
  "/storage/v1/object/public/avatars/" +
  OWNER +
  "/avatar.webp";

function read(name) {
  return fs.readFileSync(path.join(__dirname, "..", name), "utf8");
}

function fakeClient(options) {
  const calls = [];
  const settings = options || {};
  return {
    calls: calls,
    storage: {
      from(bucket) {
        calls.push({ op: "bucket", bucket: bucket });
        return {
          async upload(objectPath, body, uploadOptions) {
            calls.push({
              op: "upload",
              path: objectPath,
              type: body && body.type,
              size: body && body.size,
              options: uploadOptions
            });
            if (settings.uploadError) {
              return { data: null, error: settings.uploadError };
            }
            return { data: { path: objectPath }, error: null };
          },
          getPublicUrl(objectPath) {
            calls.push({ op: "public", path: objectPath });
            return {
              data: {
                publicUrl: settings.publicUrl ||
                  (BASE + "/storage/v1/object/public/avatars/" + objectPath)
              }
            };
          },
          async remove(paths) {
            calls.push({ op: "remove", paths: paths });
            if (settings.removeError) {
              return { data: null, error: settings.removeError };
            }
            return { data: paths, error: null };
          }
        };
      }
    },
    from(table) {
      calls.push({ op: "table", table: table });
      return {
        update(payload) {
          calls.push({ op: "update", payload: payload });
          return {
            eq(column, value) {
              calls.push({ op: "eq", column: column, value: value });
              if (settings.updateError) {
                return Promise.resolve({
                  data: null,
                  error: settings.updateError
                });
              }
              if (settings.emptyUpdate) {
                return Promise.resolve({ data: [], error: null });
              }
              return Promise.resolve({
                data: [{ id: value, avatar_url: payload.avatar_url }],
                error: null
              });
            }
          };
        },
        select() {
          return {
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      avatar_url: settings.storedUrl || null
                    },
                    error: settings.readError || null
                  });
                }
              };
            }
          };
        }
      };
    }
  };
}

function webpBlob(size) {
  const bytes = new Uint8Array(size || 32);
  bytes.set([
    0x52, 0x49, 0x46, 0x46,
    0, 0, 0, 0,
    0x57, 0x45, 0x42, 0x50
  ]);
  return new Blob([bytes], { type: "image/webp" });
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
  assert.equal(photos.objectPath(OWNER), OWNER + "/avatar.webp");
  assert.equal(
    photos.objectPath(OWNER.toUpperCase()),
    OWNER + "/avatar.webp"
  );
  assert.equal(photos.objectPath("not-a-user"), "");
  assert.equal(photos.objectPath(OWNER + "/extra"), "");
  assert.equal(
    photos.publicObjectUrl(BASE + "/", OWNER),
    CANONICAL
  );
  assert.equal(photos.publicObjectUrl("http://evil.test", OWNER), "");
  assert.equal(photos.isOwnAvatarUrl(CANONICAL, BASE, OWNER), true);
  assert.equal(
    photos.isOwnAvatarUrl(CANONICAL + "?v=1710000000", BASE, OWNER),
    true
  );
  assert.equal(
    photos.isOwnAvatarUrl(CANONICAL + "?download=1", BASE, OWNER),
    false
  );
  assert.equal(
    photos.isOwnAvatarUrl(
      CANONICAL.replace(OWNER, OTHER),
      BASE,
      OWNER
    ),
    false
  );
  assert.equal(
    photos.isOwnAvatarUrl("javascript:alert(1)", BASE, OWNER),
    false
  );
  assert.equal(photos.initialLetter(" mina "), "M");
  assert.equal(photos.initialLetter("مریم"), "م");
  assert.equal(photos.initialLetter(""), "H");

  assert.equal(
    photos.acceptsSource({ type: "image/jpeg", name: "a.jpg", size: 10 }),
    true
  );
  assert.equal(
    photos.acceptsSource({ type: "image/heic", name: "a.heic", size: 10 }),
    true
  );
  assert.equal(
    photos.acceptsSource({ type: "", name: "camera.JPG", size: 10 }),
    true
  );
  assert.equal(
    photos.acceptsSource({ type: "image/gif", name: "a.gif", size: 10 }),
    false
  );

  const tooBig = photos.assertSource.bind(null, {
    type: "image/jpeg",
    name: "big.jpg",
    size: photos.MAX_SOURCE_BYTES + 1
  });
  assert.throws(tooBig, /20 MB/);

  const wide = photos.initialCrop(400, 200, 280);
  assert.equal(wide.zoom, 1);
  assert.equal(wide.offsetY, 0);
  assert.ok(wide.offsetX < 0);
  const fitted = photos.fitCrop(
    400,
    200,
    280,
    1,
    wide.offsetX,
    wide.offsetY
  );
  assert.ok(fitted.offsetX <= 0);
  assert.ok(fitted.offsetX + fitted.drawWidth >= 280);
  assert.ok(fitted.offsetY + fitted.drawHeight >= 280);

  const zoomed = photos.fitCrop(400, 200, 280, 2, 0, 0);
  const kept = photos.zoomOffset(
    fitted.offsetX,
    280,
    fitted.scale,
    zoomed.scale
  );
  const centerSource =
    (140 - fitted.offsetX) / fitted.scale;
  assert.equal(
    (140 - kept) / zoomed.scale,
    centerSource
  );

  const client = fakeClient();
  const blob = webpBlob(64);
  const saved = await photos.uploadAvatar(client, OWNER, blob, BASE);
  assert.match(saved, new RegExp("^" + CANONICAL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\?v=[0-9]+$"));
  const upload = client.calls.find((call) => call.op === "upload");
  assert.equal(upload.path, OWNER + "/avatar.webp");
  assert.equal(upload.type, "image/webp");
  assert.equal(upload.options.upsert, true);
  assert.equal(upload.options.contentType, "image/webp");
  assert.equal(upload.options.cacheControl, "60");
  const update = client.calls.find((call) => call.op === "update");
  assert.equal(update.payload.avatar_url, saved);
  const eq = client.calls.find((call) => call.op === "eq");
  assert.equal(eq.value, OWNER);
  assert.equal(
    client.calls.some((call) => call.op === "table" && call.table === "profiles"),
    true
  );
  assert.equal(
    client.calls.some((call) => String(call.op).includes("user")),
    false
  );

  const foreign = fakeClient({
    publicUrl: BASE + "/storage/v1/object/public/avatars/" + OTHER + "/avatar.webp"
  });
  const mismatch = await rejects(() =>
    photos.uploadAvatar(foreign, OWNER, blob, BASE)
  );
  assert.equal(mismatch.code, "URL");
  assert.equal(
    foreign.calls.some((call) => call.op === "update"),
    false
  );

  const empty = fakeClient({ emptyUpdate: true });
  const emptyError = await rejects(() =>
    photos.uploadAvatar(empty, OWNER, blob, BASE)
  );
  assert.equal(emptyError.code, "PROFILE");
  assert.deepEqual(
    empty.calls.filter((call) => call.op === "remove").map((call) => call.paths),
    [[OWNER + "/avatar.webp"]]
  );
  const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
    type: "image/jpeg"
  });
  const rejectedType = await rejects(() =>
    photos.uploadAvatar(client, OWNER, jpeg, BASE)
  );
  assert.equal(rejectedType.code, "TYPE");

  const removed = fakeClient();
  await photos.removeAvatar(removed, OWNER);
  assert.deepEqual(
    removed.calls.find((call) => call.op === "remove").paths,
    [OWNER + "/avatar.webp"]
  );
  assert.equal(
    removed.calls.find((call) => call.op === "update").payload.avatar_url,
    null
  );

  const blocked = fakeClient({
    removeError: { message: "denied", statusCode: "403" }
  });
  const removeError = await rejects(() =>
    photos.removeAvatar(blocked, OWNER)
  );
  assert.equal(removeError.statusCode, "403");
  assert.equal(
    blocked.calls.some((call) => call.op === "update"),
    false
  );

  const missing = fakeClient({
    removeError: { message: "missing", statusCode: "404" }
  });
  await photos.removeAvatar(missing, OWNER);
  assert.equal(
    missing.calls.some((call) => call.op === "update"),
    true
  );

  const own = await photos.readOwnAvatar(
    fakeClient({ storedUrl: CANONICAL + "?v=5" }),
    OWNER,
    BASE
  );
  assert.equal(own, CANONICAL + "?v=5");
  const ignored = await photos.readOwnAvatar(
    fakeClient({ storedUrl: "https://cdn.example/photo.jpg" }),
    OWNER,
    BASE
  );
  assert.equal(ignored, "");

  const profile = read("profile.html");
  const chat = read("chat.html");
  const jobs = read("jobs.html");
  const services = read("services.html");
  const details = read("ad-details.html");
  const migration = read(
    "supabase/migrations/20261014120000_profile_avatars_storage.sql"
  );

  assert.match(profile, /havkar-profile-photo\.js/);
  assert.match(profile, /Choose photo/);
  assert.match(profile, /Take photo/);
  assert.match(profile, /Remove photo/);
  assert.match(profile, /id="photoCrop"/);
  assert.match(profile, /id="avatarCamera"/);
  assert.match(profile, /capture="environment"/);
  assert.match(profile, /uploadAvatar\(/);
  assert.match(profile, /removeAvatar\(/);
  assert.match(profile, /readOwnAvatar\(/);
  assert.equal(profile.includes("user_metadata"), true);
  assert.equal(profile.includes("avatar_url:"), false);
  assert.equal(profile.includes(".from(\"avatars\")"), false);

  assert.match(chat, /havkar-profile-photo\.js/);
  assert.match(chat, /conversationPartyId/);
  assert.match(chat, /HAVKAR_PROFILE_PHOTO\.mount/);
  assert.match(jobs, /havkar-profile-photo\.js/);
  assert.match(jobs, /data-poster-id/);
  assert.match(jobs, /mountJobPhotos/);
  assert.match(services, /havkar-profile-photo\.js/);
  assert.match(services, /provider-person/);
  assert.match(services, /safeImageUrl\(service\.image_url\)/);
  assert.match(details, /havkar-profile-photo\.js/);
  assert.match(details, /mountSellerPhoto/);

  assert.match(migration, /'avatars'/);
  assert.match(migration, /5242880/);
  assert.match(migration, /avatar\\\.webp/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /FOR DELETE/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /profiles_avatar_url_storage_check/);
  assert.equal(migration.includes("ADD COLUMN"), false);
  assert.equal(migration.includes("id = 'ad-images'"), false);
  assert.equal(migration.includes("id = 'service-images'"), false);

  const source = read("havkar-profile-photo.js");
  assert.equal(source.includes("updateUser"), false);
  assert.equal(source.includes("user_metadata"), false);
  assert.equal(source.includes("service_role"), false);

  const chromeDir = fs.mkdtempSync(path.join(os.tmpdir(), "havkar-photo-"));
  const chromeHtml = path.join(chromeDir, "photo.html");
  fs.writeFileSync(
    chromeHtml,
    `<!DOCTYPE html><html><body>
<div id="person" style="width:40px;height:40px"></div>
<div id="crop"></div>
<script>${source}<\/script>
<script>
const photo = window.HAVKAR_PROFILE_PHOTO;
photo.mount(document.getElementById("person"), {
  supabaseUrl: "https://example.invalid",
  userId: ${JSON.stringify(OWNER)},
  name: "Mina"
});
const canvas = document.createElement("canvas");
canvas.width = 40;
canvas.height = 20;
const context = canvas.getContext("2d");
context.fillStyle = "#ff0000";
context.fillRect(0, 0, 20, 20);
context.fillStyle = "#0000ff";
context.fillRect(20, 0, 20, 20);
const image = new Image();
image.onload = function() {
  const crop = photo.initialCrop(40, 20, 20);
  photo.exportWebp(image, {
    viewSize: 20,
    outputSize: 32,
    zoom: crop.zoom,
    offsetX: crop.offsetX,
    offsetY: crop.offsetY
  }).then(function(blob) {
    document.getElementById("crop").textContent =
      blob.type + ":" + (blob.size > 0 && blob.size <= 5242880);
  }).catch(function(error) {
    document.getElementById("crop").textContent = "ERR:" + error.message;
  });
};
image.src = canvas.toDataURL("image/png");
<\/script>
</body></html>`
  );
  const chrome = spawnSync("timeout", [
    "12",
    "google-chrome",
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    `--user-data-dir=${path.join(chromeDir, "profile")}`,
    "--virtual-time-budget=4000",
    "--dump-dom",
    chromeHtml
  ], { encoding: "utf8" });
  assert.ok(
    chrome.status === 0 || chrome.status === 124,
    chrome.stderr
  );
  assert.match(chrome.stdout, /id="person"[\s\S]*M/);
  assert.match(chrome.stdout, /id="crop"[^>]*>image\/webp:true</);

  console.log("PROFILE_PHOTO_TEST_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
