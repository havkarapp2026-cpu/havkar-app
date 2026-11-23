/* Canonical public origin for HAVKAR production auth.
   Production OAuth redirectTo / emailRedirectTo must stay on havkar.online
   so sessions are not created under the production alias havkar-app.vercel.app
   while the Owner uses havkar.online.

   Vercel Preview / deployment hosts must KEEP their own origin so Buy & Sell
   Connect login stays on the same Preview (no cross-domain token handoff).
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
    return false;
  }

  function isVercelPreviewHost(hostname) {
    var host = String(hostname || "")
      .trim()
      .toLowerCase();
    if (!host) return false;
    if (!host.endsWith(".vercel.app")) return false;
    // Production alias is not a Preview deployment.
    if (host === "havkar-app.vercel.app") return false;
    // Branch / deployment previews (git-*, unique deploy subdomains).
    return host.indexOf("havkar") !== -1;
  }

  function hrefOrigin(candidate) {
    try {
      return new URL(
        String(
          candidate ||
            (typeof location !== "undefined" ? location.href : CANONICAL)
        )
      ).origin;
    } catch (error) {
      return CANONICAL;
    }
  }

  function canonicalOrigin(candidate) {
    var host = hostOf(
      candidate || (typeof location !== "undefined" ? location.href : CANONICAL)
    );
    // Preview deployments must not bounce auth to production.
    if (isVercelPreviewHost(host)) {
      return hrefOrigin(candidate);
    }
    if (isHavkarProductionHost(host)) {
      return CANONICAL;
    }
    return hrefOrigin(candidate);
  }

  function authRedirectUrl(path, candidate) {
    var clean = String(path || "login.html").replace(/^\//, "");
    return new URL(clean, canonicalOrigin(candidate) + "/").href;
  }

  function sameOriginPathUrl(pathWithQuery, candidate) {
    var raw = String(pathWithQuery || "/").trim() || "/";
    if (raw.charAt(0) !== "/") {
      raw = "/" + raw.replace(/^\.\//, "");
    }
    return new URL(raw, canonicalOrigin(candidate) + "/").href;
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
    sameOriginPathUrl: sameOriginPathUrl,
    safeNextPath: safeNextPath,
    isHavkarProductionHost: isHavkarProductionHost,
    isVercelPreviewHost: isVercelPreviewHost
  };
})(typeof window !== "undefined" ? window : globalThis);
