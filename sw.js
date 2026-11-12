/* HAVKAR service worker — versioned install + web push display. */
var HAVKAR_SW_VERSION = "havkar-sw-20261112-chat-push-v1";

self.addEventListener("install", function (event) {
  self.skipWaiting();
  console.log("HAVKAR SW installed", HAVKAR_SW_VERSION);
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key.indexOf("havkar-") === 0 && key !== HAVKAR_SW_VERSION;
          })
          .map(function (key) {
            return caches.delete(key);
          })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
  console.log("HAVKAR SW activated", HAVKAR_SW_VERSION);
});

self.addEventListener("fetch", function () {
  // Network-first / no offline cache for HTML/API to avoid stale public pages.
});

self.addEventListener("push", function (event) {
  var data = {
    title: "HAVKAR",
    body: "You have a new message.",
    url: "/chat.html"
  };
  try {
    if (event.data) {
      var parsed = event.data.json();
      data.title = parsed.title || data.title;
      data.body = parsed.body || data.body;
      data.url = parsed.url || data.url;
      if (parsed.conversation_id) {
        data.url =
          "/chat.html?conversation_id=" + encodeURIComponent(parsed.conversation_id);
      }
    }
  } catch (_e) {
    try {
      data.body = event.data ? event.data.text() : data.body;
    } catch (_e2) {}
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      vibrate: [120, 60, 120],
      data: { url: data.url },
      renotify: true,
      tag: "havkar-chat"
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target =
    (event.notification &&
      event.notification.data &&
      event.notification.data.url) ||
    "/chat.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i += 1) {
        var client = list[i];
        if (client.url && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(target);
      }
      return undefined;
    })
  );
});
