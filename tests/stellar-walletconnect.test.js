const assert = require("assert");
const fs = require("fs");
const path = require("path");

class FakeSocket {
  constructor(url) {
    this.url = url;
    this.listeners = {};
  }
  addEventListener(type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
  }
  emit(type, event) {
    (this.listeners[type] || []).forEach((handler) => handler(event));
  }
}
FakeSocket.CONNECTING = 0;
FakeSocket.OPEN = 1;
FakeSocket.CLOSING = 2;
FakeSocket.CLOSED = 3;

(async function run() {
  const bridge = await import("../stellar-walletconnect.js");
  const source = fs.readFileSync(path.join(__dirname, "../stellar-wallet-source.js"), "utf8");
  const hidden = /reject|denied|cancel|closed|dismiss/i;

  assert.strictEqual(
    bridge.walletConnectRelayMessage({ code: 3000, message: "Unauthorized: origin not allowed" }),
    bridge.WALLETCONNECT_ORIGIN_MESSAGE
  );
  assert.strictEqual(
    bridge.walletConnectRelayMessage("{\"id\":0,\"error\":{\"code\":3000,\"message\":\"Unauthorized: origin not allowed\"}}"),
    bridge.WALLETCONNECT_ORIGIN_MESSAGE
  );
  assert.strictEqual(
    bridge.walletConnectRelayMessage("Failed to publish custom payload, please try again. id:1791649746509642496 tag:undefined"),
    bridge.WALLETCONNECT_PUBLISH_MESSAGE
  );
  assert.strictEqual(bridge.walletConnectRelayMessage("ordinary network timeout"), "");
  assert.ok(!hidden.test(bridge.WALLETCONNECT_ORIGIN_MESSAGE));
  assert.ok(!hidden.test(bridge.WALLETCONNECT_PUBLISH_MESSAGE));
  assert.ok(bridge.WALLETCONNECT_ORIGIN_MESSAGE.includes("No payment was sent."));
  assert.ok(!bridge.WALLETCONNECT_ORIGIN_MESSAGE.toLowerCase().includes("secret"));
  assert.ok(!bridge.WALLETCONNECT_ORIGIN_MESSAGE.toLowerCase().includes("private"));

  const created = [];
  function NativeSocket(url, protocols) {
    const socket = new FakeSocket(url);
    socket.protocols = protocols;
    created.push(socket);
    return socket;
  }
  NativeSocket.prototype = FakeSocket.prototype;
  NativeSocket.CONNECTING = 0;
  NativeSocket.OPEN = 1;
  NativeSocket.CLOSING = 2;
  NativeSocket.CLOSED = 3;

  const watch = bridge.observeWalletConnectRelay(NativeSocket);
  const other = new watch.Socket("wss://example.com/socket");
  assert.strictEqual(other.url, "wss://example.com/socket");
  other.emit("message", { data: "{\"error\":{\"code\":3000,\"message\":\"Unauthorized: origin not allowed\"}}" });

  const relay = new watch.Socket("wss://relay.walletconnect.org/?projectId=test");
  let caught = null;
  const pending = watch.rejected.catch((error) => {
    caught = error;
  });
  relay.emit("message", { data: "{\"id\":0,\"jsonrpc\":\"2.0\",\"error\":{\"code\":3000,\"message\":\"Unauthorized: origin not allowed\"}}" });
  await pending;
  assert.ok(caught instanceof Error);
  assert.strictEqual(caught.message, bridge.WALLETCONNECT_ORIGIN_MESSAGE);

  const second = bridge.observeWalletConnectRelay(NativeSocket);
  const closeSocket = new second.Socket("wss://relay.walletconnect.org/?projectId=test", ["json"]);
  assert.deepStrictEqual(closeSocket.protocols, ["json"]);
  let closed = null;
  const closePending = second.rejected.catch((error) => {
    closed = error;
  });
  closeSocket.emit("close", { code: 3000, reason: "Unauthorized: origin not allowed" });
  await closePending;
  assert.strictEqual(closed.message, bridge.WALLETCONNECT_ORIGIN_MESSAGE);

  assert.ok(source.includes("observeWalletConnectRelay("));
  assert.ok(source.includes("relayWatch.rejected"));
  assert.ok(source.includes("8c21324f756127dbb906a072cc18f7e6"));
  assert.ok(!source.includes("fromSecret"));

  console.log("STELLAR_WALLETCONNECT_TEST_OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
