const assert = require("assert");
const fs = require("fs");
const path = require("path");
const sdk = require("@stellar/stellar-sdk");

function proofFor(keys, token) {
  const signed = keys.publicKey() + ":" + token;
  const signature = Buffer.from(
    keys.sign(sdk.hash(Buffer.from(signed, "utf8")))
  ).toString("hex");
  return {
    pubkey: keys.publicKey(),
    signed_message: signed,
    signature: signature,
    token: token
  };
}

function timerQueue() {
  const tasks = [];
  return {
    tasks: tasks,
    schedule(fn) {
      const id = tasks.length + 1;
      tasks.push({ id: id, fn: fn, cancelled: false });
      return id;
    },
    clear(id) {
      const task = tasks.find((item) => item.id === id);
      if (task) task.cancelled = true;
    },
    runNext() {
      const task = tasks.find((item) => !item.cancelled);
      if (!task) return false;
      task.cancelled = true;
      task.fn();
      return true;
    }
  };
}

(async function run() {
  const bridge = await import("../stellar-albedo-connect.js");
  const page = fs.readFileSync(path.join(__dirname, "../albedo-return.html"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "../stellar-wallet-source.js"), "utf8");

  assert.strictEqual(bridge.isAndroidBrowser("Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36"), true);
  assert.strictEqual(bridge.isAndroidBrowser("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36"), false);
  assert.strictEqual(bridge.isAndroidBrowser(""), false);

  assert.strictEqual(
    bridge.albedoCallbackValue("https://havkar-app.vercel.app"),
    "url:https://havkar-app.vercel.app/api/albedo-connect-return"
  );
  assert.throws(() => bridge.albedoCallbackValue("http://example.com"), /https/);

  const keys = sdk.Keypair.random();
  const token = "abc123";
  const proof = proofFor(keys, token);
  assert.strictEqual(bridge.verifyAlbedoPublicKeyProof(proof), true);
  assert.strictEqual(bridge.verifyAlbedoPublicKeyProof({ ...proof, token: "other1" }), false);
  assert.strictEqual(bridge.verifyAlbedoPublicKeyProof({ ...proof, signature: "ab".repeat(64) }), false);
  assert.strictEqual(bridge.verifyAlbedoPublicKeyProof({ ...proof, pubkey: sdk.Keypair.random().publicKey() }), false);

  const target = bridge.albedoReturnQuery({
    pubkey: proof.pubkey,
    signed_message: proof.signed_message,
    signature: proof.signature,
    __reqid: "req1"
  });
  assert.ok(target.startsWith("/albedo-return.html?"));
  const params = new URL(target, "https://havkar-app.vercel.app").searchParams;
  assert.strictEqual(params.get("pubkey"), proof.pubkey);
  assert.strictEqual(params.get("signed_message"), proof.signed_message);
  assert.strictEqual(params.get("reqid"), "req1");
  assert.strictEqual(bridge.albedoReturnQuery({ pubkey: "not-a-key" }), null);
  assert.ok(page.includes(bridge.ALBEDO_CONNECT_CHANNEL));
  assert.ok(source.includes("havkar-albedo-connect") || source.includes("ALBEDO_CONNECT_CHANNEL"));
  assert.ok(!source.includes("fromSecret"));

  const posts = [];
  const popup = {
    closed: false,
    postMessage(message, origin) {
      posts.push({ message: message, origin: origin });
    },
    close() {
      this.closed = true;
    }
  };
  const timers = timerQueue();
  let proxy = null;
  let opened = null;
  const listeners = [];
  const patched = bridge.createAlbedoConnectOpen(
    function (url, target, features) {
      opened = { url: url, target: target, features: features };
      return popup;
    },
    {
      retryDelays: [10, 20, 30],
      schedule: timers.schedule,
      clearSchedule: timers.clear,
      listen(handler) {
        listeners.push(handler);
      },
      dispatchHandshake() {
        proxy.postMessage({ intent: "public_key", token: token }, "*");
      },
      onPopup(value) {
        assert.strictEqual(value, popup);
      }
    }
  );

  assert.strictEqual(
    patched("https://example.com", "other", ""),
    popup
  );
  proxy = patched(
    "https://albedo.link/confirm",
    "auth.albedo.link",
    "height=600,width=480"
  );
  assert.strictEqual(opened.url, "https://albedo.link/confirm");
  assert.ok(!String(opened.url).includes("about:blank"));
  assert.strictEqual(posts.length, 0);
  assert.strictEqual(timers.runNext(), true);
  assert.strictEqual(posts.length, 1);
  assert.strictEqual(posts[0].message.intent, "public_key");
  assert.strictEqual(timers.runNext(), true);
  assert.strictEqual(timers.runNext(), true);
  assert.strictEqual(posts.length, 3);
  assert.strictEqual(timers.runNext(), false);

  const postsAfterHandshake = [];
  const handshakePopup = {
    closed: false,
    postMessage(message, origin) {
      postsAfterHandshake.push({ message: message, origin: origin });
    }
  };
  const handshakeTimers = timerQueue();
  const handshakeListeners = [];
  let handshakeProxy = null;
  const handshakeOpen = bridge.createAlbedoConnectOpen(
    function () {
      return handshakePopup;
    },
    {
      retryDelays: [10, 20, 30],
      schedule: handshakeTimers.schedule,
      clearSchedule: handshakeTimers.clear,
      listen(handler) {
        handshakeListeners.push(handler);
      },
      dispatchHandshake() {
        throw new Error("synthetic handshake was not required");
      }
    }
  );
  handshakeProxy = handshakeOpen(
    "https://albedo.link/confirm",
    "auth.albedo.link",
    "height=600"
  );
  handshakeListeners[0]({
    origin: "https://albedo.link",
    data: { albedo: { protocol: 3 } }
  });
  handshakeProxy.postMessage({ intent: "public_key" }, "*");
  assert.strictEqual(postsAfterHandshake.length, 1);
  assert.strictEqual(handshakeTimers.runNext(), false);

  let channelListener = null;
  let channelClosed = false;
  const pending = new Promise(function () {});
  const raced = bridge.raceAlbedoPublicKey({
    token: token,
    pending: pending,
    timeoutMs: 1000,
    schedule: timers.schedule,
    clearSchedule: timers.clear,
    listen(handler) {
      channelListener = handler;
    },
    closeChannel() {
      channelClosed = true;
    }
  });
  channelListener({
    pubkey: proof.pubkey,
    signed_message: "tampered",
    signature: proof.signature
  });
  channelListener(proof);
  assert.strictEqual(await raced, proof.pubkey);
  assert.strictEqual(channelClosed, true);

  const rejected = bridge.raceAlbedoPublicKey({
    token: token,
    pending: Promise.resolve({
      pubkey: proof.pubkey,
      signed_message: proof.signed_message,
      signature: "11".repeat(64)
    }),
    timeoutMs: 1000,
    schedule(fn) {
      return 1;
    },
    clearSchedule() {},
    listen() {}
  });
  await assert.rejects(rejected, /did not match/);

  const handler = (await import("../api/albedo-connect-return.js")).default;
  const response = {
    statusCode: 0,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end() {
      this.ended = true;
    }
  };
  await handler({
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      pubkey: proof.pubkey,
      signed_message: proof.signed_message,
      signature: proof.signature,
      __reqid: "req1"
    }).toString()
  }, response);
  assert.strictEqual(response.statusCode, 303);
  assert.ok(response.headers.Location.startsWith("/albedo-return.html?"));
  assert.ok(!response.headers.Location.includes("http://"));
  assert.ok(!response.headers.Location.includes("secret"));

  const denied = {
    statusCode: 0,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = body;
    }
  };
  await handler({ method: "GET", headers: {} }, denied);
  assert.strictEqual(denied.statusCode, 405);

  console.log("STELLAR_ALBEDO_CONNECT_TEST_OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
