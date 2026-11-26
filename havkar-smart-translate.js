/**
 * HAVKAR Smart Translator (user content)
 * =========================================================
 * Explicit, user-initiated translation for listings, ads,
 * chat messages, and support text via existing /api/translate.
 *
 * Rules:
 * - Never auto-run on page load or list render
 * - Reuses Google Translation credentials server-side only
 * - Client cache + graceful rate-limit errors
 * - View original / Show translation toggle
 * =========================================================
 */
(function (root) {
  "use strict";

  var API_URL = "/api/translate";
  var CACHE_KEY = "havkar_smart_translate_cache_v1";
  var LISTINGS_ASK_KEY = "havkar_ask_before_listing_translate";
  var MAX_CACHE = 200;
  var memoryCache = new Map();

  function loadPersistentCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      Object.keys(parsed).forEach(function (k) {
        if (typeof parsed[k] === "string") memoryCache.set(k, parsed[k]);
      });
    } catch (_e) {}
  }

  function savePersistentCache() {
    try {
      var obj = {};
      var i = 0;
      memoryCache.forEach(function (v, k) {
        if (i < MAX_CACHE) {
          obj[k] = v;
          i += 1;
        }
      });
      localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    } catch (_e) {}
  }

  loadPersistentCache();

  function getLanguage() {
    try {
      if (root.HAVKAR_I18N && typeof root.HAVKAR_I18N.getLanguage === "function") {
        return root.HAVKAR_I18N.getLanguage() || "en";
      }
    } catch (_e) {}
    try {
      return localStorage.getItem("havkar_language") || "en";
    } catch (_e2) {
      return "en";
    }
  }

  function t(key) {
    try {
      if (root.HAVKAR_I18N && typeof root.HAVKAR_I18N.t === "function") {
        return root.HAVKAR_I18N.t(key);
      }
    } catch (_e) {}
    return key;
  }

  function cacheKey(text, source, target) {
    return [source || "auto", target || "en", String(text || "")].join("\u0001");
  }

  function askBeforeListings() {
    try {
      var v = localStorage.getItem(LISTINGS_ASK_KEY);
      if (v === null || v === undefined || v === "") return true;
      return v !== "0";
    } catch (_e) {
      return true;
    }
  }

  function setAskBeforeListings(enabled) {
    try {
      localStorage.setItem(LISTINGS_ASK_KEY, enabled ? "1" : "0");
    } catch (_e) {}
  }

  async function translateText(text, options) {
    var opts = options || {};
    var source = opts.sourceLanguage || "auto";
    var target = opts.targetLanguage || getLanguage();
    var trimmed = String(text || "").trim();
    if (!trimmed) {
      return { ok: false, error: "empty", translatedText: "" };
    }
    if (!target || target === "en" && source === "en") {
      return { ok: true, translatedText: trimmed, cached: true, skipped: true };
    }

    var key = cacheKey(trimmed, source, target);
    if (memoryCache.has(key)) {
      return {
        ok: true,
        translatedText: memoryCache.get(key),
        cached: true
      };
    }

    var response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          sourceLanguage: source,
          targetLanguage: target
        })
      });
    } catch (networkError) {
      return {
        ok: false,
        error: "network",
        message: String(networkError && networkError.message || networkError)
      };
    }

    var data = {};
    try {
      data = await response.json();
    } catch (_e) {
      data = {};
    }

    if (response.status === 429 || data.code === "rate_limited") {
      return {
        ok: false,
        error: "rate_limited",
        message: data.error || "Translation rate limit reached. Try again later."
      };
    }

    if (!response.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || "translate_failed",
        message: data.error || "Translation failed."
      };
    }

    var translated =
      (data.translatedText && String(data.translatedText)) ||
      (Array.isArray(data.translations) &&
        data.translations[0] &&
        data.translations[0].translatedText) ||
      "";

    translated = String(translated || "").trim();
    if (!translated) {
      return { ok: false, error: "empty_result", translatedText: "" };
    }

    memoryCache.set(key, translated);
    savePersistentCache();

    return {
      ok: true,
      translatedText: translated,
      detectedLanguage: data.detectedSourceLanguage || data.detectedLanguageCode || null,
      cached: false
    };
  }

  function ensureStyles() {
    if (document.getElementById("havkar-smart-translate-style")) return;
    var style = document.createElement("style");
    style.id = "havkar-smart-translate-style";
    style.textContent =
      ".hk-smart-translate-wrap{margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}" +
      ".hk-smart-translate-btn{appearance:none;border:1px solid #c8d6c4;background:#f4f8f2;color:#1b5e20;" +
      "border-radius:10px;padding:6px 12px;font:600 13px/1.2 inherit;cursor:pointer}" +
      ".hk-smart-translate-btn:disabled{opacity:.55;cursor:wait}" +
      ".hk-smart-translate-btn.active{background:#1b5e20;color:#fff;border-color:#1b5e20}" +
      ".hk-smart-translate-status{font-size:12px;color:#5f6b5c}" +
      ".hk-smart-translate-result{margin-top:8px;padding:10px 12px;border-radius:12px;" +
      "background:#f0f6ee;border:1px solid #d7e6d2;color:#243024;white-space:pre-wrap}";
    document.head.appendChild(style);
  }

  /**
   * Mount Translate / View original controls next to a content element.
   * @param {HTMLElement} contentEl element whose textContent is the user content
   * @param {object} options { targetLanguage, sourceLanguage, confirmBefore }
   */
  function mountControls(contentEl, options) {
    if (!contentEl || contentEl.getAttribute("data-hk-smart-translate") === "1") {
      return null;
    }
    ensureStyles();
    contentEl.setAttribute("data-hk-smart-translate", "1");

    var opts = options || {};
    var originalText = String(
      opts.originalText != null ? opts.originalText : contentEl.textContent || ""
    ).trim();
    if (!originalText) return null;

    var wrap = document.createElement("div");
    wrap.className = "hk-smart-translate-wrap notranslate";
    wrap.setAttribute("translate", "no");
    wrap.setAttribute("data-i18n-ignore", "");

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hk-smart-translate-btn";
    btn.textContent = t("Translate");

    var status = document.createElement("span");
    status.className = "hk-smart-translate-status";

    var result = document.createElement("div");
    result.className = "hk-smart-translate-result";
    result.hidden = true;

    var showingTranslation = false;
    var lastTranslation = "";

    async function runTranslate() {
      if (showingTranslation && lastTranslation) {
        contentEl.textContent = originalText;
        result.hidden = true;
        showingTranslation = false;
        btn.textContent = t("Translate");
        btn.classList.remove("active");
        status.textContent = "";
        return;
      }

      if (opts.confirmBefore || (opts.kind === "listing" && askBeforeListings())) {
        var ok = window.confirm(
          t("Translate this content into your language?")
        );
        if (!ok) return;
      }

      btn.disabled = true;
      status.textContent = t("Translating…");
      var res = await translateText(originalText, {
        sourceLanguage: opts.sourceLanguage || "auto",
        targetLanguage: opts.targetLanguage || getLanguage()
      });
      btn.disabled = false;

      if (!res.ok) {
        status.textContent =
          res.error === "rate_limited"
            ? t("Translation limit reached. Try again later.")
            : t("Translation failed.");
        return;
      }

      if (res.skipped) {
        status.textContent = t("Already in your language");
        return;
      }

      lastTranslation = res.translatedText;
      contentEl.textContent = lastTranslation;
      result.textContent = t("View original") + ": " + originalText;
      result.hidden = false;
      showingTranslation = true;
      btn.textContent = t("View original");
      btn.classList.add("active");
      status.textContent = res.cached
        ? t("Cached translation")
        : t("Translated");
    }

    btn.addEventListener("click", function () {
      runTranslate();
    });

    wrap.appendChild(btn);
    wrap.appendChild(status);

    if (contentEl.parentNode) {
      contentEl.parentNode.insertBefore(wrap, contentEl.nextSibling);
      wrap.appendChild(result);
    }

    return {
      refreshOriginal: function (text) {
        originalText = String(text || "").trim();
        showingTranslation = false;
        lastTranslation = "";
        btn.textContent = t("Translate");
        btn.classList.remove("active");
        result.hidden = true;
        status.textContent = "";
      },
      translate: runTranslate
    };
  }

  /**
   * Mount translate on incoming chat bubbles that lack translated_text.
   */
  function mountOnChatMessage(messageEl, message) {
    if (!messageEl || !message) return null;
    var translated = String(message.translated_text || "").trim();
    var original = String(message.message_text || "").trim();
    if (!original) return null;

    var textEl =
      messageEl.querySelector(".message-text") ||
      messageEl.querySelector("[data-message-text]") ||
      null;
    if (!textEl) return null;

    if (translated) {
      // Already has stored translation — add View original toggle only.
      if (messageEl.getAttribute("data-hk-view-original") === "1") return null;
      messageEl.setAttribute("data-hk-view-original", "1");
      ensureStyles();
      var wrap = document.createElement("div");
      wrap.className = "hk-smart-translate-wrap notranslate";
      wrap.setAttribute("translate", "no");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hk-smart-translate-btn";
      var showingOriginal = false;
      btn.textContent = t("View original");
      btn.addEventListener("click", function () {
        showingOriginal = !showingOriginal;
        if (showingOriginal) {
          textEl.textContent = original;
          btn.textContent = t("Show translation");
        } else {
          textEl.textContent = translated;
          btn.textContent = t("View original");
        }
      });
      wrap.appendChild(btn);
      textEl.parentNode && textEl.parentNode.appendChild(wrap);
      return { mode: "toggle-existing" };
    }

    return mountControls(textEl, {
      originalText: original,
      kind: "chat",
      sourceLanguage: "auto"
    });
  }

  /**
   * Scan common listing/description selectors once (user must tap Translate).
   */
  function attachToSelectors(selectors, options) {
    var list = Array.isArray(selectors) ? selectors : [selectors];
    var mounted = [];
    list.forEach(function (sel) {
      if (!sel) return;
      document.querySelectorAll(sel).forEach(function (el) {
        var ctrl = mountControls(el, options || { kind: "listing" });
        if (ctrl) mounted.push(ctrl);
      });
    });
    return mounted;
  }

  /**
   * Keep mounting Translate controls on dynamically added listing nodes.
   * Never auto-translates — only attaches the user-initiated button.
   */
  function observeAndAttach(selectors, options) {
    var opts = options || { kind: "listing" };
    var mounted = attachToSelectors(selectors, opts);
    if (typeof MutationObserver !== "function" || !document.body) {
      return mounted;
    }
    var timer = null;
    var observer = new MutationObserver(function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        attachToSelectors(selectors, opts);
      }, 200);
    });
    try {
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (_e) {}
    return mounted;
  }

  root.HAVKAR_SMART_TRANSLATE = {
    translateText: translateText,
    mountControls: mountControls,
    mountOnChatMessage: mountOnChatMessage,
    attachToSelectors: attachToSelectors,
    observeAndAttach: observeAndAttach,
    askBeforeListings: askBeforeListings,
    setAskBeforeListings: setAskBeforeListings,
    LISTINGS_ASK_KEY: LISTINGS_ASK_KEY,
    t: t
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
