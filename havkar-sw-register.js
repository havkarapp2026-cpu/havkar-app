(function () {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  var SW_URL = "/sw.js?v=havkar-sw-20261110-stripe-legal-v4";

  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then(function (registration) {
        if (registration && registration.update) {
          registration.update();
        }
      })
      .catch(function () {
        // Ignore registration failures; pages still work without SW.
      });
  });
})();
