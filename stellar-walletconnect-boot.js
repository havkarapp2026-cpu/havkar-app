var HavkarWalletConnectBoot = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // stellar-walletconnect.js
  var stellar_walletconnect_exports = {};
  __export(stellar_walletconnect_exports, {
    WALLETCONNECT_ORIGIN_MESSAGE: () => WALLETCONNECT_ORIGIN_MESSAGE,
    WALLETCONNECT_PUBLISH_MESSAGE: () => WALLETCONNECT_PUBLISH_MESSAGE,
    WALLETCONNECT_RELAY_HOST: () => WALLETCONNECT_RELAY_HOST,
    installWalletConnectRelayWatch: () => installWalletConnectRelayWatch,
    observeWalletConnectRelay: () => observeWalletConnectRelay,
    walletConnectRelayMessage: () => walletConnectRelayMessage
  });
  var WALLETCONNECT_RELAY_HOST = "relay.walletconnect.org";
  var WALLETCONNECT_ORIGIN_MESSAGE = "WalletConnect blocked this website. The relay returned code 3000, origin not allowed. No payment was sent.";
  var WALLETCONNECT_PUBLISH_MESSAGE = "WalletConnect could not publish the connection request. No payment was sent.";
  function walletConnectRelayMessage(input) {
    const details = input && typeof input === "object" ? input : { message: input };
    const text = String(
      details.message || details.reason || ""
    );
    if (details.code === 3e3 || /origin not allowed/i.test(text)) {
      return WALLETCONNECT_ORIGIN_MESSAGE;
    }
    if (/Failed to publish custom payload/i.test(text)) {
      return WALLETCONNECT_PUBLISH_MESSAGE;
    }
    return "";
  }
  function observeWalletConnectRelay(nativeWebSocket) {
    let rejectRelay = function() {
    };
    const rejected = new Promise(
      function(_resolve, reject) {
        rejectRelay = reject;
      }
    );
    let reported = false;
    function report(details) {
      if (reported) {
        return;
      }
      const message = walletConnectRelayMessage(details);
      if (!message) {
        return;
      }
      reported = true;
      rejectRelay(
        new Error(message)
      );
    }
    function RelaySocket(url, protocols) {
      const socket = arguments.length < 2 ? new nativeWebSocket(url) : new nativeWebSocket(url, protocols);
      if (String(url).indexOf(WALLETCONNECT_RELAY_HOST) === -1) {
        return socket;
      }
      socket.addEventListener(
        "message",
        function(event) {
          report({
            message: String(
              event && event.data || ""
            )
          });
        }
      );
      socket.addEventListener(
        "close",
        function(event) {
          report({
            code: event && event.code,
            message: event && event.reason
          });
        }
      );
      return socket;
    }
    RelaySocket.prototype = nativeWebSocket.prototype;
    RelaySocket.CONNECTING = nativeWebSocket.CONNECTING;
    RelaySocket.OPEN = nativeWebSocket.OPEN;
    RelaySocket.CLOSING = nativeWebSocket.CLOSING;
    RelaySocket.CLOSED = nativeWebSocket.CLOSED;
    rejected.catch(
      function() {
      }
    );
    return {
      Socket: RelaySocket,
      rejected
    };
  }
  function installWalletConnectRelayWatch(target) {
    const root = target || globalThis;
    if (!root || typeof root.WebSocket !== "function" || root.__havkarWalletConnectRelay) {
      return root && root.__havkarWalletConnectRelay;
    }
    const watch = observeWalletConnectRelay(
      root.WebSocket
    );
    root.WebSocket = watch.Socket;
    root.__havkarWalletConnectRelay = watch.rejected;
    watch.rejected.catch(
      function(error) {
        root.__havkarWalletConnectFailure = error;
      }
    );
    return watch.rejected;
  }
  if (typeof window !== "undefined" && window.document) {
    installWalletConnectRelayWatch(window);
  }
  return __toCommonJS(stellar_walletconnect_exports);
})();
