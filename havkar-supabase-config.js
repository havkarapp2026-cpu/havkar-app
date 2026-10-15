(function () {
  var production = {
    url: "https://gispovnciifgikvgpzck.supabase.co",
    publishableKey: "sb_publishable_KD8yd063Xik2oMyjevwWYg_tJK2jEKq"
  };
  var staging = {
    url: "https://keglioewbkgdabsizvys.supabase.co",
    publishableKey: "sb_publishable_a7paZ5jrvFIGYABCY05w3g_c16W9hz8"
  };
  var closed = {
    url: "",
    publishableKey: ""
  };
  var host = "";

  try {
    host = window.location && window.location.hostname
      ? String(window.location.hostname).trim().toLowerCase()
      : "";
  } catch (error) {
    host = "";
  }

  if (host.charAt(0) === "[") {
    var end = host.indexOf("]");
    host = end > 0 ? host.slice(1, end) : "";
  }

  var selected = closed;

  if (
    host === "havkar-app.vercel.app" ||
    host === "testnet.havkar.online" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === ""
  ) {
    selected = production;
  } else if (host === "staging.havkar.online") {
    selected = staging;
  }

  window.HAVKAR_SUPABASE_CONFIG = {
    url: selected.url,
    publishableKey: selected.publishableKey
  };
})();
