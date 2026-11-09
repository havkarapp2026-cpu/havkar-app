/* HAVKAR service worker — safe no-cache pass-through with versioned install. */
var HAVKAR_SW_VERSION = "havkar-sw-20261109-final-prod-v2";

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
