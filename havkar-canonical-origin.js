/* Canonical public origin for HAVKAR production.
   OAuth redirectTo / emailRedirectTo must stay on this host so sessions
   are not created under havkar-app.vercel.app while the Owner uses havkar.online.
   No secrets. Safe to load on every public page. */
(function (root) {
  var CANONICAL = "https://havkar.online";

  function hostOf(value) {
    try {
      return String(new URL(String(value || ""), "https://havkar.online").hostname || "")
        .trim()
        .toLowerCase();
    } catch (error) {
      return "";
    }
  }

  function isHavkarProductionHost(hostname) {
    var host = String(hostname || "")
      .trim()
      .toLowerCase();
    if (!host) return false;
    if (host === "havkar.online" || host === "www.havkar.online") return true;
    if (host === "havkar-app.vercel.app") return true;
    if (host.endsWith(".vercel.app") && host.indexOf("havkar") !== -1) return true;
    return false;
  }

  function canonicalOrigin(candidate) {
    var host = hostOf(candidate || (typeof location !== "undefined" ? location.href : CANONICAL));
    if (isHavkarProductionHost(host)) {
      return CANONICAL;
    }
    try {
      return new URL(String(candidate || location.href)).origin;
    } catch (error) {
      return CANONICAL;
    }
  }

  function authRedirectUrl(path, candidate) {
    var clean = String(path || "login.html").replace(/^\//, "");
    return new URL(clean, canonicalOrigin(candidate) + "/").href;
  }

  function safeNextPath(raw) {
    var text = String(raw || "").trim();
    if (!text) return "";
    if (text.charAt(0) !== "/") return "";
    if (text.indexOf("//") !== -1) return "";
    if (text.indexOf("\\") !== -1) return "";
    if (text.indexOf(":") !== -1) return "";
    return text;
  }

  root.HAVKAR_CANONICAL = {
    origin: CANONICAL,
    canonicalOrigin: canonicalOrigin,
    authRedirectUrl: authRedirectUrl,
    safeNextPath: safeNextPath,
    isHavkarProductionHost: isHavkarProductionHost
  };
})(typeof window !== "undefined" ? window : globalThis);
