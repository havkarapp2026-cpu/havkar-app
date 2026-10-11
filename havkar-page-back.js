/*
 * HAVKAR in-app back destination.
 *
 * The Android Chrome history stack is not a reliable way to decide
 * whether history.back() will leave the current HAVKAR page.
 * This function returns a same-origin page to open directly.
 * It does not call history.back() and it does not add a history entry.
 */
(function (root, factory) {

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.HAVKAR_PAGE_BACK = api;

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  const FALLBACK = "index.html";

  function havkarBackDestination(currentHref, referrer) {

    let current;

    try {
      current = new URL(String(currentHref || ""), "https://havkar.invalid");
    } catch (error) {
      return FALLBACK;
    }

    if (!referrer) {
      return FALLBACK;
    }

    let previous;

    try {
      previous = new URL(String(referrer));
    } catch (error) {
      return FALLBACK;
    }

    if (previous.origin !== current.origin) {
      return FALLBACK;
    }

    const path = previous.pathname || "/";
    const isPage = path === "/" || /\.html$/i.test(path);

    if (!isPage || path.indexOf("\\") !== -1) {
      return FALLBACK;
    }

    if (path === current.pathname) {
      return FALLBACK;
    }

    if (path === "/") {
      return FALLBACK;
    }

    const relative = path.replace(/^\/+/, "") + previous.search + previous.hash;

    if (!relative || relative.indexOf("//") === 0 || relative.indexOf("\\") !== -1) {
      return FALLBACK;
    }

    return relative;

  }

  return {
    havkarBackDestination: havkarBackDestination
  };

});
