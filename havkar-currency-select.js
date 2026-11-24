/**
 * HAVKAR reusable 133-fiat + separate XLM currency selector.
 * XLM is NOT a 134th Stripe presentment currency / banking fiat.
 * Display ≠ charge ≠ settlement — never invent FX rates.
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

  function regionFor(code) {
    if (root.HAVKAR_CURRENCY_REGIONS && typeof root.HAVKAR_CURRENCY_REGIONS.regionFor === "function") {
      return root.HAVKAR_CURRENCY_REGIONS.regionFor(code) || "";
    }
    return "";
  }

  function enrich(row) {
    if (!row) return null;
    var code = normalizeCode(row.code);
    return Object.assign({}, row, {
      code: code,
      region: row.region || regionFor(code)
    });
  }

  function buildShell(mount, options) {
    var opts = options || {};
    var idPrefix = String(opts.idPrefix || "havkarCur");
    var shell = document.createElement("div");
    shell.className = "havkar-currency-select";
    shell.setAttribute("data-havkar-currency-select", "1");
    var includeXlm = opts.includeXlm !== false && opts.includeXlm !== 0;
    var compact = opts.compact === true;
    var moduleName = String(opts.module || "tickets");
    shell.setAttribute("data-module", moduleName);
    shell.setAttribute("translate", "no");
    shell.classList.add("notranslate");
    if (compact) shell.classList.add("hcs-compact");
    shell.innerHTML =
      '<div class="hcs-rails" aria-label="Currency rails">' +
      '<div class="hcs-rail"><span>Display</span><strong data-hcs="display">—</strong></div>' +
      '<div class="hcs-rail"><span>Payment</span><strong data-hcs="payment">—</strong></div>' +
      '<div class="hcs-rail"><span>Settlement</span><strong data-hcs="settlement">EUR (Stripe) / XLM on-ledger</strong></div>' +
      "</div>" +
      '<div class="hcs-featured" role="listbox" aria-label="Featured currencies"></div>' +
      (includeXlm
        ? '<button type="button" class="hcs-xlm" data-method="xlm_mainnet" aria-pressed="false">' +
          '<span class="hcs-xlm-mark" aria-hidden="true">✦</span> XLM — Stellar Lumens' +
          '<span class="hcs-xlm-note">Independent crypto rail · not a banking / Stripe fiat currency</span>' +
          "</button>"
        : "") +
      '<button type="button" class="hcs-toggle" aria-expanded="false">View all 133 currencies</button>' +
      '<div class="hcs-all" hidden>' +
      '<label class="hcs-search-label" for="' +
      idPrefix +
      'Search">Search by name, ISO code, symbol, or region</label>' +
      '<input id="' +
      idPrefix +
      'Search" class="hcs-search" type="search" autocomplete="off" placeholder="EUR, Yen, Sweden…">' +
      '<div class="hcs-list" role="listbox" aria-label="All 133 currencies"></div>' +
      "</div>" +
      '<p class="hcs-fx" data-hcs="fx" role="status">FX: waiting for a valid rate feed…</p>' +
      '<p class="hcs-status" role="status"></p>';
    mount.appendChild(shell);
    shell.__includeXlm = includeXlm;
    shell.__moduleName = moduleName;
    return shell;
  }

  function ensureStyles() {
    if (document.getElementById("havkar-currency-select-css")) return;
    var style = document.createElement("style");
    style.id = "havkar-currency-select-css";
    style.textContent =
      ".havkar-currency-select{display:grid;gap:10px;font:inherit;color:#243024}" +
      ".hcs-rails{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;padding:10px 12px;border-radius:14px;border:1px solid #d7e6cb;background:linear-gradient(145deg,#ffffff,#f3f9ee)}" +
      ".hcs-rail span{display:block;font-size:.7rem;letter-spacing:.04em;text-transform:uppercase;color:#5f6b60}" +
      ".hcs-rail strong{display:block;margin-top:3px;color:#3e6b22;font-size:.95rem}" +
      ".hcs-featured{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}" +
      ".hcs-card,.hcs-xlm,.hcs-opt,.hcs-toggle{font:inherit;cursor:pointer}" +
      ".hcs-card{border:1px solid #cfe0d3;border-radius:14px;background:linear-gradient(180deg,#fff,#f4faf5);padding:10px 12px;text-align:left;min-height:72px;box-shadow:0 4px 14px rgba(36,48,36,.05)}" +
      ".hcs-card.active,.hcs-opt.active{outline:2px solid #7cb342;background:#e8f5e9}" +
      ".hcs-card strong,.hcs-opt strong{display:block;color:#3e6b22}" +
      ".hcs-card span,.hcs-opt span,.hcs-xlm-note{display:block;font-size:12px;color:#5f6b60;margin-top:2px;line-height:1.35}" +
      ".hcs-xlm{display:flex;flex-direction:column;align-items:flex-start;gap:2px;border:1px solid #8fbf7a;border-radius:14px;background:linear-gradient(180deg,#f7fcf7,#e8f5e9);padding:12px;color:#3e6b22;font-weight:700}" +
      ".hcs-xlm.active{outline:2px solid #558b2f}" +
      ".hcs-xlm-mark{font-size:16px}" +
      ".hcs-toggle{border:1px solid #7cb342;border-radius:12px;background:#fff;color:#3e6b22;font-weight:700;min-height:42px;padding:0 12px}" +
      ".hcs-search{width:100%;min-height:44px;border:1px solid #cfe0d3;border-radius:12px;padding:0 12px;box-sizing:border-box;background:#fff}" +
      ".hcs-list{max-height:260px;overflow:auto;-webkit-overflow-scrolling:touch;border:1px solid #e0ebe2;border-radius:14px;background:#fff}" +
      ".hcs-opt{display:grid;grid-template-columns:1fr auto;gap:6px 10px;width:100%;border:0;border-bottom:1px solid #eef5ef;background:#fff;padding:11px 12px;text-align:left}" +
      ".hcs-opt:hover{background:#f4faf5}" +
      ".hcs-opt .hcs-meta{grid-column:1/-1;font-size:11px;color:#6a776b}" +
      ".hcs-status,.hcs-fx{margin:0;font-size:13px;color:#456;line-height:1.45}" +
      ".hcs-fx{padding:8px 10px;border-radius:12px;background:#fbfff8;border:1px dashed #b7d0a8}" +
      ".hcs-search-label{display:block;font-size:13px;margin:4px 0;color:#456}" +
      ".hcs-compact .hcs-featured{grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px}" +
      ".hcs-compact .hcs-card{min-height:56px;padding:8px 10px}" +
      ".hcs-compact .hcs-list{max-height:200px}" +
      "html[dir=rtl] .hcs-card,html[dir=rtl] .hcs-opt,html[dir=rtl] .hcs-xlm{text-align:right}";
    document.head.appendChild(style);
  }

  /**
   * Convert EUR major → display currency using a rates map.
   * Refuses (ok:false) when rate missing — never invents.
   */
  function convertFromEur(amountEur, currency, rates) {
    var code = String(currency || "EUR").toUpperCase();
    var amt = Number(amountEur);
    if (!Number.isFinite(amt)) {
      return { ok: false, error: "invalid_amount" };
    }
    if (code === "XLM") {
      return {
        ok: false,
        error: "xlm_not_fx_fiat",
        note: "XLM is on-ledger crypto; not converted via banking FX feeds."
      };
    }
    if (code === "EUR") {
      return { ok: true, currency: "EUR", amount: amt, rate: 1 };
    }
    var rate = rates && rates[code];
    if (!rate || !Number.isFinite(Number(rate)) || Number(rate) <= 0) {
      return { ok: false, error: "fx_rate_missing", currency: code };
    }
    return {
      ok: true,
      currency: code,
      amount: Math.round(amt * Number(rate) * 100) / 100,
      rate: Number(rate)
    };
  }

  function mountCurrencySelect(mount, options) {
    if (!mount) {
      return { ok: false, error: "mount_missing" };
    }
    ensureStyles();
    var opts = options || {};
    var currencies = presentmentList().map(enrich).filter(Boolean);
    var selectedCode = normalizeCode(opts.initialCurrency || "eur");
    var selectedMethod = opts.initialMethod === "xlm_mainnet" ? "xlm_mainnet" : "stripe";
    var onChange = typeof opts.onChange === "function" ? opts.onChange : null;
    var persistKey = String(opts.persistKey || "");
    var shell = buildShell(mount, opts);
    var featuredEl = shell.querySelector(".hcs-featured");
    var listEl = shell.querySelector(".hcs-list");
    var searchEl = shell.querySelector(".hcs-search");
    var toggleEl = shell.querySelector(".hcs-toggle");
    var allEl = shell.querySelector(".hcs-all");
    var xlmBtn = shell.querySelector(".hcs-xlm");
    var statusEl = shell.querySelector(".hcs-status");
    var fxEl = shell.querySelector('[data-hcs="fx"]');
    var displayEl = shell.querySelector('[data-hcs="display"]');
    var paymentEl = shell.querySelector('[data-hcs="payment"]');
    var settlementEl = shell.querySelector('[data-hcs="settlement"]');
    var fxState = {
      rates: null,
      date: null,
      fetched_at: null,
      expires_at: null,
      source: null,
      covered: null,
      live_collection: null
    };

    if (persistKey) {
      try {
        var saved = localStorage.getItem(persistKey);
        if (saved) {
          var parsed = JSON.parse(saved);
          if (parsed && parsed.currency) selectedCode = normalizeCode(parsed.currency);
          if (parsed && parsed.method === "xlm_mainnet") selectedMethod = "xlm_mainnet";
        }
      } catch (_e) {}
    }

    function byCode(code) {
      var want = normalizeCode(code);
      for (var i = 0; i < currencies.length; i++) {
        if (normalizeCode(currencies[i].code) === want) return currencies[i];
      }
      return null;
    }

    function persist() {
      if (!persistKey) return;
      try {
        localStorage.setItem(
          persistKey,
          JSON.stringify({ currency: selectedCode, method: selectedMethod })
        );
      } catch (_e) {}
    }

    function paintRails() {
      var meta = byCode(selectedCode);
      var label =
        selectedMethod === "xlm_mainnet"
          ? "XLM (display preference)"
          : String((meta && meta.code) || selectedCode).toUpperCase() +
            (meta && meta.symbol ? " · " + meta.symbol : "");
      if (displayEl) displayEl.textContent = label;
      if (paymentEl) {
        paymentEl.textContent =
          selectedMethod === "xlm_mainnet"
            ? "XLM on Stellar (Owner-gated live)"
            : "Stripe presentment " +
              String((meta && meta.code) || selectedCode).toUpperCase() +
              " when live charging is armed";
      }
      if (settlementEl) {
        settlementEl.textContent =
          selectedMethod === "xlm_mainnet"
            ? "On-ledger XLM (never via Stripe)"
            : "EUR to HAVKAR Stripe/Revolut account";
      }
    }

    function paintFx() {
      if (!fxEl) return;
      if (!fxState.rates) {
        fxEl.textContent =
          "FX: no valid rate feed loaded. Converted prices stay hidden until a real rate arrives.";
        return;
      }
      var covered =
        fxState.covered && Number.isFinite(fxState.covered.covered_count)
          ? fxState.covered.covered_count
          : Object.keys(fxState.rates).length;
      var missing =
        fxState.covered && Number.isFinite(fxState.covered.missing_count)
          ? fxState.covered.missing_count
          : null;
      var bits = [
        "FX source: " + (fxState.source || "provider"),
        "updated " + (fxState.date || fxState.fetched_at || "unknown"),
        "rates for " + covered + "/" + (currencies.length || 133) + " presentment codes"
      ];
      if (missing != null && missing > 0) {
        bits.push(missing + " codes refuse conversion (no invented rate)");
      }
      if (fxState.live_collection) {
        bits.push("card live collection: " + fxState.live_collection);
      }
      if (selectedMethod === "xlm_mainnet") {
        bits.push("XLM is not converted through banking FX");
      } else if (selectedCode !== "eur") {
        var rate = fxState.rates[String(selectedCode).toUpperCase()];
        if (rate && Number(rate) > 0) {
          bits.push(
            "1 EUR = " + Number(rate) + " " + String(selectedCode).toUpperCase()
          );
        } else {
          bits.push(
            String(selectedCode).toUpperCase() +
              " has no valid rate — converted amounts will not be shown"
          );
        }
      }
      fxEl.textContent = bits.join(" · ");
    }

    function emit() {
      var meta = byCode(selectedCode) || {
        code: selectedCode,
        name: selectedCode.toUpperCase(),
        region: regionFor(selectedCode)
      };
      paintRails();
      paintFx();
      persist();
      if (statusEl) {
        statusEl.textContent =
          selectedMethod === "xlm_mainnet"
            ? "Selected: XLM crypto rail (not banking fiat). Partner travel checkouts do not take XLM — they keep their own fiat. Live Stellar payments stay Owner-gated."
            : "Selected display: " +
              String(meta.code || "").toUpperCase() +
              " — " +
              (meta.name || "") +
              (meta.region ? " · " + meta.region : "") +
              " · " +
              currencies.length +
              " presentment currencies available for display. Showing 133 ≠ live charge for all.";
      }
      if (onChange) {
        onChange({
          method: selectedMethod,
          currency: normalizeCode(meta.code || selectedCode),
          meta: meta,
          presentmentCount: currencies.length,
          fx: fxState.rates
            ? {
                rates: fxState.rates,
                date: fxState.date,
                fetched_at: fxState.fetched_at,
                expires_at: fxState.expires_at,
                source: fxState.source,
                coverage: fxState.covered
              }
            : null,
          rails: {
            display: selectedMethod === "xlm_mainnet" ? "xlm" : normalizeCode(meta.code || selectedCode),
            payment:
              selectedMethod === "xlm_mainnet"
                ? "xlm_mainnet"
                : "stripe_presentment",
            settlement: selectedMethod === "xlm_mainnet" ? "xlm_on_ledger" : "eur"
          }
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
        btn.innerHTML = "<strong></strong><span></span><span class='hcs-region'></span>";
        btn.querySelector("strong").textContent =
          String(row.code).toUpperCase() + (row.symbol ? "  " + row.symbol : "");
        btn.querySelector("span").textContent = row.name || "";
        btn.querySelector(".hcs-region").textContent = row.region || regionFor(row.code);
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
          var region = c.region || regionFor(c.code);
          return (c.code + " " + c.name + " " + (c.symbol || "") + " " + region)
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
          btn.innerHTML =
            "<strong></strong><span></span><span class='hcs-meta'></span>";
          btn.querySelector("strong").textContent =
            String(c.code).toUpperCase() + " — " + (c.name || "");
          btn.querySelector("span").textContent = c.symbol || "";
          btn.querySelector(".hcs-meta").textContent =
            (c.region || regionFor(c.code) || "") +
            (c.zero_decimal ? " · zero-decimal" : "");
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
      try {
        var res = await fetch("/api/currency-matrix");
        var body = await res.json();
        var list = (body && body.matrix && body.matrix.currencies) || [];
        if (list.length) {
          currencies = list.map(enrich).filter(Boolean);
          root.HAVKAR_PRESENTMENT_CURRENCIES = {
            count: list.length,
            list: list,
            codes: list.map(function (c) {
              return c.code;
            })
          };
        }
        if (body && body.fx && body.fx.rates) {
          fxState.rates = body.fx.rates;
          fxState.date = body.fx.date || body.fx_date || null;
          fxState.fetched_at = body.fx.fetched_at || body.fx_fetched_at || null;
          fxState.expires_at = body.fx.expires_at || body.fx_expires_at || null;
          fxState.source = body.fx.source || body.fx_source || null;
          fxState.covered = body.fx.coverage || null;
        }
        fxState.live_collection = body && body.live_collection ? body.live_collection : null;
      } catch (_e) {
        /* offline registry may still be enough; FX stays refused */
      }
      paint();
      emit();
    }

    if (currencies.length >= 130) {
      paint();
      emit();
      hydrateFromApi();
    } else {
      hydrateFromApi();
    }

    return {
      ok: true,
      getSelection: function () {
        return {
          method: selectedMethod,
          currency: selectedCode,
          meta: byCode(selectedCode),
          presentmentCount: currencies.length,
          fx: fxState.rates
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
      convertFromEur: function (amountEur, currency) {
        return convertFromEur(amountEur, currency || selectedCode, fxState.rates);
      },
      getFx: function () {
        return fxState.rates
          ? {
              rates: fxState.rates,
              date: fxState.date,
              fetched_at: fxState.fetched_at,
              expires_at: fxState.expires_at,
              source: fxState.source,
              coverage: fxState.covered
            }
          : null;
      },
      destroy: function () {
        if (shell && shell.parentNode) shell.parentNode.removeChild(shell);
      }
    };
  }

  root.HAVKAR_CURRENCY_SELECT = {
    FEATURED: FEATURED.slice(),
    mount: mountCurrencySelect,
    presentmentList: presentmentList,
    convertFromEur: convertFromEur,
    regionFor: regionFor
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
