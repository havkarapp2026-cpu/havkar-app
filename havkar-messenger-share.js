/**
 * HAVKAR Messenger — content sharing helpers (client).
 * Shares only public/canonical HAVKAR URLs; never invents delivery/read state.
 */
(function (global) {
  "use strict";

  var SHARE_PREFIX = "[havkar-share]";
  var ALLOWED_HOSTS = [
    "havkar.online",
    "www.havkar.online",
    "havkar-app.vercel.app",
    "localhost",
    "127.0.0.1"
  ];
  var BLOCKED_PATH_RE =
    /(^|\/)(admin|staff|owner|settings\.html|login\.html|signup\.html|api\/)/i;

  function trim(s) {
    return String(s == null ? "" : s).trim();
  }

  function isAllowedUrl(raw) {
    var u;
    try {
      u = new URL(raw, global.location && global.location.origin);
    } catch (_e) {
      return false;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    var host = String(u.hostname || "").toLowerCase();
    var okHost =
      ALLOWED_HOSTS.indexOf(host) >= 0 ||
      /\.vercel\.app$/i.test(host) ||
      host.endsWith(".havkar.online");
    if (!okHost) return false;
    if (BLOCKED_PATH_RE.test(u.pathname || "")) return false;
    return true;
  }

  function canonicalize(raw) {
    var u = new URL(raw, global.location.origin);
    if (
      hostIsLocal(u.hostname) &&
      global.location &&
      /havkar\.online$/i.test(global.location.hostname)
    ) {
      u.hostname = "havkar.online";
      u.protocol = "https:";
    }
    u.hash = "";
    return u.toString();
  }

  function hostIsLocal(h) {
    h = String(h || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1";
  }

  function parseSharePayload(text) {
    var t = trim(text);
    if (!t.startsWith(SHARE_PREFIX)) return null;
    var json = t.slice(SHARE_PREFIX.length);
    try {
      var data = JSON.parse(json);
      if (!data || typeof data !== "object") return null;
      if (!data.url || !isAllowedUrl(data.url)) return null;
      return {
        v: 1,
        type: String(data.type || "link"),
        url: canonicalize(data.url),
        title: trim(data.title || "HAVKAR content").slice(0, 160),
        description: trim(data.description || "").slice(0, 280),
        thumb: data.thumb && isAllowedUrl(data.thumb) ? canonicalize(data.thumb) : "",
        note: trim(data.note || "").slice(0, 500)
      };
    } catch (_e) {
      return null;
    }
  }

  function encodeSharePayload(item) {
    var payload = {
      v: 1,
      type: String(item.type || "link"),
      url: canonicalize(item.url),
      title: trim(item.title || "HAVKAR content").slice(0, 160),
      description: trim(item.description || "").slice(0, 280),
      thumb: item.thumb && isAllowedUrl(item.thumb) ? canonicalize(item.thumb) : "",
      note: trim(item.note || "").slice(0, 500)
    };
    if (!isAllowedUrl(payload.url)) {
      throw new Error("share_url_not_allowed");
    }
    return SHARE_PREFIX + JSON.stringify(payload);
  }

  function detectTypeFromUrl(url) {
    var p = "";
    try {
      p = new URL(url, global.location.origin).pathname.toLowerCase();
    } catch (_e) {
      return "link";
    }
    if (/buy-sell|ad-details|product/.test(p)) return "listing";
    if (/ads\.html|ad-/.test(p)) return "ad";
    if (/services\.html/.test(p)) return "service";
    if (/jobs\.html/.test(p)) return "job";
    if (/events\.html/.test(p)) return "event";
    if (/tickets\.html/.test(p)) return "ticket";
    if (/accommodation|hotel/.test(p)) return "stay";
    if (/profile\.html|business/.test(p)) return "profile";
    return "link";
  }

  function buildShareCard(payload, options) {
    options = options || {};
    var root = document.createElement("div");
    root.className = "havkar-share-card";
    root.setAttribute("data-havkar-share", "1");
    root.setAttribute("dir", "auto");

    if (payload.thumb) {
      var img = document.createElement("img");
      img.className = "havkar-share-thumb";
      img.alt = "";
      img.loading = "lazy";
      img.src = payload.thumb;
      img.onerror = function () {
        img.remove();
      };
      root.appendChild(img);
    }

    var body = document.createElement("div");
    body.className = "havkar-share-body";

    var typeEl = document.createElement("div");
    typeEl.className = "havkar-share-type";
    typeEl.textContent = String(payload.type || "link").toUpperCase();
    body.appendChild(typeEl);

    var title = document.createElement("div");
    title.className = "havkar-share-title";
    title.textContent = payload.title || "HAVKAR";
    body.appendChild(title);

    if (payload.description) {
      var desc = document.createElement("div");
      desc.className = "havkar-share-desc";
      desc.textContent = payload.description;
      body.appendChild(desc);
    }

    if (payload.note) {
      var note = document.createElement("div");
      note.className = "havkar-share-note";
      note.textContent = payload.note;
      body.appendChild(note);
    }

    var open = document.createElement("a");
    open.className = "havkar-share-open";
    open.href = payload.url;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = options.openLabel || "Open";
    body.appendChild(open);

    root.appendChild(body);
    return root;
  }

  async function copyText(text) {
    if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (_e) {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  async function nativeShare(item) {
    if (!global.navigator || typeof navigator.share !== "function") {
      return { ok: false, reason: "unsupported" };
    }
    var url = canonicalize(item.url);
    if (!isAllowedUrl(url)) return { ok: false, reason: "blocked" };
    try {
      await navigator.share({
        title: trim(item.title || "HAVKAR"),
        text: trim(item.description || item.note || ""),
        url: url
      });
      return { ok: true };
    } catch (err) {
      if (err && err.name === "AbortError") return { ok: false, reason: "aborted" };
      return { ok: false, reason: String((err && err.message) || err) };
    }
  }

  function ensureStyles() {
    if (document.getElementById("havkar-messenger-share-css")) return;
    var style = document.createElement("style");
    style.id = "havkar-messenger-share-css";
    style.textContent =
      ".havkar-share-card{display:flex;gap:10px;align-items:stretch;max-width:100%;margin:4px 0;padding:10px;border-radius:14px;background:linear-gradient(160deg,#0b1f12,#12301c 55%,#0d2416);border:1px solid rgba(124,179,66,.45);color:#e8ffe8;box-shadow:0 8px 18px rgba(0,0,0,.18)}" +
      ".havkar-share-thumb{width:72px;height:72px;object-fit:cover;border-radius:12px;flex:0 0 auto;background:#0a160e}" +
      ".havkar-share-body{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}" +
      ".havkar-share-type{font-size:.68rem;letter-spacing:.04em;opacity:.75;font-weight:700}" +
      ".havkar-share-title{font-weight:800;font-size:.95rem;line-height:1.25;color:#fff}" +
      ".havkar-share-desc,.havkar-share-note{font-size:.82rem;line-height:1.35;opacity:.9}" +
      ".havkar-share-note{font-style:italic;opacity:.85}" +
      ".havkar-share-open{display:inline-flex;align-items:center;justify-content:center;margin-top:6px;min-height:36px;padding:0 12px;border-radius:999px;background:#7cb342;color:#06210c;font-weight:800;text-decoration:none;width:fit-content}" +
      ".havkar-share-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:12000;display:flex;align-items:flex-end;justify-content:center;padding:16px}" +
      ".havkar-share-modal{width:min(520px,100%);background:#fff;color:#1b2b1f;border-radius:18px 18px 12px 12px;padding:16px;box-shadow:0 18px 40px rgba(0,0,0,.28);max-height:85vh;overflow:auto}" +
      ".havkar-share-modal h3{margin:0 0 8px;font-size:1.05rem}" +
      ".havkar-share-modal label{display:block;font-size:.82rem;font-weight:700;margin:10px 0 4px}" +
      ".havkar-share-modal input,.havkar-share-modal textarea{width:100%;min-height:44px;border:1px solid #cfe0d3;border-radius:12px;padding:10px 12px;font:inherit}" +
      ".havkar-share-modal textarea{min-height:72px;resize:vertical}" +
      ".havkar-share-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}" +
      ".havkar-share-actions button{min-height:44px;border:0;border-radius:12px;padding:0 14px;font-weight:800;cursor:pointer}" +
      ".havkar-share-actions .primary{background:#2e7d32;color:#fff}" +
      ".havkar-share-actions .secondary{background:#e8f5e9;color:#1b5e20}" +
      ".havkar-share-actions .ghost{background:transparent;color:#456}" +
      "@media (min-width:768px){.havkar-share-modal-backdrop{align-items:center}.havkar-share-modal{border-radius:18px}}";
    document.head.appendChild(style);
  }

  function openShareComposer(defaults, handlers) {
    ensureStyles();
    handlers = handlers || {};
    defaults = defaults || {};
    var backdrop = document.createElement("div");
    backdrop.className = "havkar-share-modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    var modal = document.createElement("div");
    modal.className = "havkar-share-modal";
    modal.innerHTML =
      "<h3 data-i18n-share-title>Share in HAVKAR Messenger</h3>" +
      "<label>Link</label><input id='hmShareUrl' type='url' autocomplete='off' />" +
      "<label>Title</label><input id='hmShareTitle' type='text' maxlength='160' />" +
      "<label>Description</label><textarea id='hmShareDesc' maxlength='280'></textarea>" +
      "<label>Optional message</label><textarea id='hmShareNote' maxlength='500'></textarea>" +
      "<div class='havkar-share-actions'>" +
      "<button type='button' class='primary' id='hmShareSend'>Send in chat</button>" +
      "<button type='button' class='secondary' id='hmShareCopy'>Copy link</button>" +
      "<button type='button' class='secondary' id='hmShareNative'>Device share</button>" +
      "<button type='button' class='ghost' id='hmShareClose'>Close</button>" +
      "</div>";

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    var urlEl = modal.querySelector("#hmShareUrl");
    var titleEl = modal.querySelector("#hmShareTitle");
    var descEl = modal.querySelector("#hmShareDesc");
    var noteEl = modal.querySelector("#hmShareNote");
    urlEl.value = defaults.url || (global.location && global.location.href) || "";
    titleEl.value = defaults.title || document.title || "HAVKAR";
    descEl.value = defaults.description || "";
    noteEl.value = defaults.note || "";

    function close() {
      backdrop.remove();
    }

    function currentItem() {
      return {
        type: detectTypeFromUrl(urlEl.value),
        url: trim(urlEl.value),
        title: trim(titleEl.value),
        description: trim(descEl.value),
        note: trim(noteEl.value),
        thumb: defaults.thumb || ""
      };
    }

    modal.querySelector("#hmShareClose").onclick = close;
    backdrop.addEventListener("click", function (ev) {
      if (ev.target === backdrop) close();
    });

    modal.querySelector("#hmShareCopy").onclick = async function () {
      var item = currentItem();
      if (!isAllowedUrl(item.url)) {
        if (handlers.onError) handlers.onError("This link cannot be shared.");
        return;
      }
      var ok = await copyText(canonicalize(item.url));
      if (handlers.onCopied) handlers.onCopied(ok);
    };

    modal.querySelector("#hmShareNative").onclick = async function () {
      var item = currentItem();
      var res = await nativeShare(item);
      if (!res.ok && res.reason === "unsupported") {
        var ok = await copyText(canonicalize(item.url));
        if (handlers.onCopied) handlers.onCopied(ok);
      } else if (handlers.onNative) {
        handlers.onNative(res);
      }
    };

    modal.querySelector("#hmShareSend").onclick = async function () {
      var item = currentItem();
      try {
        var encoded = encodeSharePayload(item);
        if (handlers.onSend) await handlers.onSend(encoded, item);
        close();
      } catch (_e) {
        if (handlers.onError) handlers.onError("Only public HAVKAR links can be shared.");
      }
    };

    urlEl.focus();
    return { close: close, el: backdrop };
  }

  function renderIntoMessageText(textEl, messageText, options) {
    var payload = parseSharePayload(messageText);
    if (!payload || !textEl) return false;
    ensureStyles();
    textEl.textContent = "";
    if (payload.note) {
      var note = document.createElement("div");
      note.className = "havkar-share-note-plain";
      note.style.cssText = "margin-bottom:8px;white-space:pre-wrap";
      note.textContent = payload.note;
      textEl.appendChild(note);
    }
    textEl.appendChild(buildShareCard(payload, options));
    return true;
  }

  global.HAVKAR_MESSENGER_SHARE = {
    SHARE_PREFIX: SHARE_PREFIX,
    isAllowedUrl: isAllowedUrl,
    canonicalize: canonicalize,
    parseSharePayload: parseSharePayload,
    encodeSharePayload: encodeSharePayload,
    detectTypeFromUrl: detectTypeFromUrl,
    buildShareCard: buildShareCard,
    openShareComposer: openShareComposer,
    renderIntoMessageText: renderIntoMessageText,
    copyText: copyText,
    nativeShare: nativeShare,
    ensureStyles: ensureStyles
  };
})(typeof window !== "undefined" ? window : globalThis);
