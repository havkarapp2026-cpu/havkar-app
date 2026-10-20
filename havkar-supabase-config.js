(function () {
  var production = {
    url: "https://gispovnciifgikvgpzck.supabase.co",
    publishableKey: "sb_publishable_KD8yd063Xik2oMyjevwWYg_tJK2jEKq"
  };

  var stellarPreview = {
    url: "https://keglioewbkgdabsizvys.supabase.co",
    publishableKey: "sb_publishable_a7paZ5jrvFIGYABCY05w3g_c16W9hz8"
  };

  var stellarPreviewHosts = {
    "havkar-app-git-cursor-stell-609741-havkarapp2026-4055s-projects.vercel.app": true
  };

  function havkarSelectSupabaseConfig(hostname) {
    var host = String(hostname || "").trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(stellarPreviewHosts, host)) {
      return stellarPreview;
    }
    return production;
  }

  var hostname = "";
  if (typeof location !== "undefined" && location && typeof location.hostname === "string") {
    hostname = location.hostname;
  }

  window.HAVKAR_SUPABASE_CONFIG = havkarSelectSupabaseConfig(hostname);
  window.havkarSelectSupabaseConfig = havkarSelectSupabaseConfig;
})();
