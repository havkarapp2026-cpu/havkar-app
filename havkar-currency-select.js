/**
 * HAVKAR reusable 133-fiat + separate XLM currency selector.
 * XLM is NOT a 134th Stripe presentment currency.
 */
(function (root) {
  "use strict";

  var FEATURED = ["eur", "usd", "gbp", "sek", "cny", "jpy", "krw", "inr"];

  function presentmentList() {
    var bag = root.HAVKAR_PRESENTMENT_CURRENCIES;
    if (bag && Array.isArray(bag.list) && bag.list.length) {
      return bag.list.slice();
    }
    return [];
  }

  function normalizeCode(code) {
    return String(code || "")
      .trim()
      .toLowerCase();
  }

  function buildShell(mount, options) {
    var opts = options || {};
    var idPrefix = String(opts.idPrefix || "havkarCur");
    var shell = document.createElement("div");
    shell.className = "havkar-currency-select";
    shell.setAttribute("data-havkar-currency-select", "1");
    var includeXlm = opts.includeXlm !== false && opts.includeXlm !== 0;
    var compact = opts.compact === true;
    shell.setAttribute("translate", "no");
    shell.classList.add("notranslate");
    if (compact) shell.classList.add("hcs-compact");
    shell.innerHTML =
      '<div class="hcs-featured" role="listbox" aria-label="Featured currencies"></div>' +
      (includeXlm
        ? '<button type="button" class="hcs-xlm" data-method="xlm_mainnet" aria-pressed="false">' +
          '<span class="hcs-xlm-mark" aria-hidden="true">✦</span> XLM — Stellar Lumens' +
          '<span class="hcs-xlm-note">Cryptocurrency · not a Stripe fiat currency</span>' +
          "</button>"
        : "") +
      '<button type="button" class="hcs-toggle" aria-expanded="false">View all 133 currencies</button>' +
      '<div class="hcs-all" hidden>' +
      '<label class="hcs-search-label" for="' +
      idPrefix +
      'Search">Search by name or ISO code</label>' +
      '<input id="' +
      idPrefix +
      'Search" class="hcs-search" type="search" autocomplete="off" placeholder="EUR, CNY, Yen…">' +
      '<div class="hcs-list" role="listbox" aria-label="All 133 currencies"></div>' +
      "</div>" +
      '<p class="hcs-status" role="status"></p>';
    mount.appendChild(shell);
    shell.__includeXlm = includeXlm;
    return shell;
  }

  function ensureStyles() {
    if (document.getElementById("havkar-currency-select-css")) return;
    var style = document.createElement("style");
    style.id = "havkar-currency-select-css";
    style.textContent =
      ".havkar-currency-select{display:grid;gap:10px;font:inherit;color:#123}" +
      ".hcs-featured{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}" +
      ".hcs-card,.hcs-xlm,.hcs-opt,.hcs-toggle{font:inherit;cursor:pointer}" +
      ".hcs-card{border:1px solid #cfe0d3;border-radius:12px;background:linear-gradient(180deg,#fff,#f4faf5);padding:10px 12px;text-align:left;min-height:64px}" +
      ".hcs-card.active,.hcs-opt.active{outline:2px solid #1b5e20;background:#e8f5e9}" +
      ".hcs-card strong,.hcs-opt strong{display:block;color:#1b5e20}" +
      ".hcs-card span,.hcs-opt span,.hcs-xlm-note{display:block;font-size:12px;color:#567;margin-top:2px}" +
      ".hcs-xlm{display:flex;flex-direction:column;align-items:flex-start;gap:2px;border:1px solid #8fbf7a;border-radius:12px;background:linear-gradient(180deg,#f7fcf7,#e8f5e9);padding:12px;color:#1b5e20;font-weight:700}" +
      ".hcs-xlm.active{outline:2px solid #2e7d32}" +
      ".hcs-xlm-mark{font-size:16px}" +
      ".hcs-toggle{border:1px solid #1b5e20;border-radius:10px;background:#fff;color:#1b5e20;font-weight:700;min-height:42px;padding:0 12px}" +
      ".hcs-search{width:100%;min-height:44px;border:1px solid #cfd;border-radius:10px;padding:0 10px;box-sizing:border-box}" +
      ".hcs-list{max-height:240px;overflow:auto;border:1px solid #e0ebe2;border-radius:12px;background:#fff}" +
      ".hcs-opt{display:flex;justify-content:space-between;gap:8px;width:100%;border:0;border-bottom:1px solid #eef5ef;background:#fff;padding:10px 12px;text-align:left}" +
      ".hcs-opt:hover{background:#f4faf5}" +
      ".hcs-status{margin:0;font-size:13px;color:#456}" +
      ".hcs-search-label{display:block;font-size:13px;margin:4px 0;color:#456}.hcs-compact .hcs-featured{grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px}.hcs-compact .hcs-card{min-height:52px;padding:8px 10px}.hcs-compact .hcs-list{max-height:180px}";
    document.head.appendChild(style);
  }

  function mountCurrencySelect(mount, options) {
    if (!mount) {
      return { ok: false, error: "mount_missing" };
    }
    ensureStyles();
    var opts = options || {};
    var currencies = presentmentList();
    var selectedCode = normalizeCode(opts.initialCurrency || "eur");
    var selectedMethod = opts.initialMethod === "xlm_mainnet" ? "xlm_mainnet" : "stripe";
    var onChange = typeof opts.onChange === "function" ? opts.onChange : null;
    var shell = buildShell(mount, opts);
    var featuredEl = shell.querySelector(".hcs-featured");
    var listEl = shell.querySelector(".hcs-list");
    var searchEl = shell.querySelector(".hcs-search");
    var toggleEl = shell.querySelector(".hcs-toggle");
    var allEl = shell.querySelector(".hcs-all");
    var xlmBtn = shell.querySelector(".hcs-xlm");
    var statusEl = shell.querySelector(".hcs-status");

    function byCode(code) {
      var want = normalizeCode(code);
      for (var i = 0; i < currencies.length; i++) {
        if (normalizeCode(currencies[i].code) === want) return currencies[i];
      }
      return null;
    }

    function emit() {
      var meta = byCode(selectedCode) || { code: selectedCode, name: selectedCode.toUpperCase() };
      if (statusEl) {
        statusEl.textContent =
          selectedMethod === "xlm_mainnet"
            ? "Payment method: Stellar XLM (crypto). Display/settlement rules stay provider-gated."
            : "Payment currency: " +
              String(meta.code || "").toUpperCase() +
              " — " +
              (meta.name || "") +
              " · " +
              currencies.length +
              " Stripe presentment currencies · XLM separate";
      }
      if (onChange) {
        onChange({
          method: selectedMethod,
          currency: normalizeCode(meta.code || selectedCode),
          meta: meta,
          presentmentCount: currencies.length
        });
      }
    }

    function paintFeatured() {
      featuredEl.innerHTML = "";
      FEATURED.forEach(function (code) {
        var row = byCode(code);
        if (!row) return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "hcs-card" +
          (selectedMethod === "stripe" && normalizeCode(row.code) === selectedCode
            ? " active"
            : "");
        btn.setAttribute("role", "option");
        btn.setAttribute("translate", "no");
        btn.classList.add("notranslate");
        btn.setAttribute(
          "aria-selected",
          selectedMethod === "stripe" && normalizeCode(row.code) === selectedCode
            ? "true"
            : "false"
        );
        btn.innerHTML =
          "<strong></strong><span></span>";
        btn.querySelector("strong").textContent = String(row.code).toUpperCase();
        btn.querySelector("span").textContent =
          (row.name || "") + (row.symbol ? " · " + row.symbol : "");
        btn.addEventListener("click", function () {
          selectedMethod = "stripe";
          selectedCode = normalizeCode(row.code);
          paint();
          emit();
        });
        featuredEl.appendChild(btn);
      });
    }

    function paintList(filter) {
      var q = String(filter || "")
        .trim()
        .toLowerCase();
      listEl.innerHTML = "";
      currencies
        .filter(function (c) {
          if (!q) return true;
          return (c.code + " " + c.name + " " + (c.symbol || ""))
            .toLowerCase()
            .indexOf(q) !== -1;
        })
        .forEach(function (c) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className =
            "hcs-opt" +
            (selectedMethod === "stripe" && normalizeCode(c.code) === selectedCode
              ? " active"
              : "");
          btn.innerHTML = "<strong></strong><span></span>";
          btn.querySelector("strong").textContent =
            String(c.code).toUpperCase() + " — " + (c.name || "");
          btn.querySelector("span").textContent = c.symbol || "";
          btn.addEventListener("click", function () {
            selectedMethod = "stripe";
            selectedCode = normalizeCode(c.code);
            paint();
            emit();
          });
          listEl.appendChild(btn);
        });
    }

    function paint() {
      paintFeatured();
      paintList(searchEl && searchEl.value);
      if (xlmBtn) {
        xlmBtn.classList.toggle("active", selectedMethod === "xlm_mainnet");
        xlmBtn.setAttribute(
          "aria-pressed",
          selectedMethod === "xlm_mainnet" ? "true" : "false"
        );
      }
      if (toggleEl) {
        toggleEl.textContent =
          "View all " + (currencies.length || 133) + " currencies";
      }
    }

    if (xlmBtn && shell.__includeXlm !== false) {
      xlmBtn.addEventListener("click", function () {
        selectedMethod = "xlm_mainnet";
        paint();
        emit();
      });
    }
    if (toggleEl && allEl) {
      toggleEl.addEventListener("click", function () {
        var open = allEl.hidden;
        allEl.hidden = !open;
        toggleEl.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    if (searchEl) {
      searchEl.addEventListener("input", function () {
        paintList(searchEl.value);
      });
    }

    async function hydrateFromApi() {
      if (currencies.length >= 130) {
        paint();
        emit();
        return;
      }
      try {
        var res = await fetch("/api/currency-matrix");
        var body = await res.json();
        var list = (body && body.matrix && body.matrix.currencies) || [];
        if (list.length) {
          currencies = list;
          if (!root.HAVKAR_PRESENTMENT_CURRENCIES) {
            root.HAVKAR_PRESENTMENT_CURRENCIES = {
              count: list.length,
              list: list,
              codes: list.map(function (c) {
                return c.code;
              })
            };
          }
        }
      } catch (_e) {
        /* offline registry may still be enough */
      }
      paint();
      emit();
    }

    hydrateFromApi();

    return {
      ok: true,
      getSelection: function () {
        return {
          method: selectedMethod,
          currency: selectedCode,
          meta: byCode(selectedCode),
          presentmentCount: currencies.length
        };
      },
      setCurrency: function (code) {
        selectedMethod = "stripe";
        selectedCode = normalizeCode(code);
        paint();
        emit();
      },
      setMethod: function (method) {
        selectedMethod = method === "xlm_mainnet" ? "xlm_mainnet" : "stripe";
        paint();
        emit();
      },
      destroy: function () {
        if (shell && shell.parentNode) shell.parentNode.removeChild(shell);
      }
    };
  }

  root.HAVKAR_CURRENCY_SELECT = {
    FEATURED: FEATURED.slice(),
    mount: mountCurrencySelect,
    presentmentList: presentmentList
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
