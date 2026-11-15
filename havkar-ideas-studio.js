(function (root) {
  "use strict";

  const API = "/api/ideas-studio";

  function $(id) {
    return document.getElementById(id);
  }

  function getSupabase() {
    if (root.supabaseClient) return root.supabaseClient;
    if (root.HAVKAR_SUPABASE_CONFIG && root.supabase) {
      const cfg = root.HAVKAR_SUPABASE_CONFIG;
      root.supabaseClient = root.supabase.createClient(cfg.url, cfg.publishableKey || cfg.anonKey);
      return root.supabaseClient;
    }
    return null;
  }

  async function accessToken() {
    const client = getSupabase();
    if (!client) return "";
    const session = await client.auth.getSession();
    return session && session.data && session.data.session
      ? session.data.session.access_token
      : "";
  }

  async function api(action, body) {
    const token = await accessToken();
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json"
    };
    if (token) headers.Authorization = "Bearer " + token;
    const response = await fetch(API, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(Object.assign({ action: action }, body || {}))
    });
    const json = await response.json().catch(function () {
      return null;
    });
    if (!response.ok || !json || json.ok === false) {
      const err = (json && json.error) || "Request failed";
      throw new Error(err);
    }
    return json;
  }

  function setStatus(message, isError) {
    const node = $("studioStatus");
    if (!node) return;
    node.textContent = String(message || "");
    node.dataset.tone = isError ? "error" : "ok";
  }

  function showPanel(name) {
    document.querySelectorAll("[data-studio-panel]").forEach(function (el) {
      el.hidden = el.getAttribute("data-studio-panel") !== name;
    });
    document.querySelectorAll("[data-studio-nav]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-studio-nav") === name);
    });
  }

  async function ensureAuth() {
    const token = await accessToken();
    if (!token) {
      window.location.href = "login.html?from=ideas-studio";
      return false;
    }
    return true;
  }

  async function loadStatus() {
    const data = await api("ideas_studio_status");
    const box = $("flagsBox");
    if (box) {
      box.innerHTML =
        "<p><strong>Payments:</strong> OFF</p>" +
        "<p><strong>Public publish:</strong> OFF</p>" +
        "<p><strong>Ownership transfer:</strong> OFF</p>" +
        "<p><strong>Proposed split:</strong> 70% HAVKAR / 30% partner (net profit, inactive)</p>" +
        "<p>" + data.flags.note + "</p>";
    }
    const tpl = $("templateList");
    if (tpl && data.templates) {
      tpl.innerHTML = data.templates
        .map(function (t) {
          return (
            '<button type="button" class="template-card" data-template="' +
            t.id +
            '"><strong>' +
            t.name +
            "</strong><small>Supported: " +
            t.supported.slice(0, 3).join(", ") +
            "</small><em>Unsupported: " +
            t.unsupported.slice(0, 2).join(", ") +
            "</em></button>"
          );
        })
        .join("");
    }
    return data;
  }

  async function refreshIdeas() {
    if (!(await ensureAuth())) return;
    const data = await api("list_ideas");
    const list = $("ideasList");
    if (!list) return;
    if (!data.ideas.length) {
      list.innerHTML = "<p class='empty'>No private ideas yet. Create a draft below.</p>";
      return;
    }
    list.innerHTML = data.ideas
      .map(function (idea) {
        return (
          '<article class="idea-card" data-idea-id="' +
          idea.id +
          '"><header><h3>' +
          escapeHtml(idea.title) +
          '</h3><span class="badge">' +
          escapeHtml(idea.status) +
          "</span></header><p>" +
          escapeHtml(idea.description).slice(0, 180) +
          "</p><footer><button type='button' data-submit-idea='" +
          idea.id +
          "' " +
          (idea.status === "draft" || idea.status === "rejected" || idea.status === "withdrawn"
            ? ""
            : "disabled") +
          ">Submit for review</button></footer></article>"
        );
      })
      .join("");
  }

  async function refreshVentures() {
    if (!(await ensureAuth())) return;
    const data = await api("list_ventures");
    const list = $("venturesList");
    if (!list) return;
    root.__havkarVentures = data.ventures || [];
    if (!data.ventures.length) {
      list.innerHTML = "<p class='empty'>No ventures yet. Pick a Studio template.</p>";
      return;
    }
    list.innerHTML = data.ventures
      .map(function (v) {
        return (
          '<article class="venture-card"><header><h3>' +
          escapeHtml(v.name) +
          '</h3><span class="badge">' +
          escapeHtml(v.status) +
          "</span></header><p>Template: " +
          escapeHtml(v.template_id) +
          " · slug <code>" +
          escapeHtml(v.slug) +
          "</code></p><p>Payments OFF · Public publish OFF" +
          (v.is_aldo_pilot ? " · Aldo pilot" : "") +
          "</p><footer>" +
          "<button type='button' data-open-venture='" +
          v.id +
          "'>Open workspace</button>" +
          "<button type='button' data-review-venture='" +
          v.id +
          "'>Request review</button>" +
          (v.is_aldo_pilot
            ? "<button type='button' data-aldo-venture='" + v.id + "'>Aldo simulation</button>"
            : "") +
          "</footer></article>"
        );
      })
      .join("");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderPreview(config) {
    const preview = $("builderPreview");
    if (!preview) return;
    const theme = (config && config.theme) || {};
    preview.style.setProperty("--preview-primary", theme.primary || "#0d3d16");
    preview.style.setProperty("--preview-accent", theme.accent || "#1c9a43");
    preview.innerHTML =
      '<div class="preview-shell">' +
      '<p class="sim-banner">PRIVATE PREVIEW · not publicly published</p>' +
      "<h3>" +
      escapeHtml((config && config.heroTitle) || (config && config.template_name) || "Venture") +
      "</h3><p>" +
      escapeHtml((config && config.heroSubtitle) || "Template-based Studio preview") +
      "</p><ul>" +
      ((config && config.sections) || [])
        .map(function (s) {
          return "<li>" + escapeHtml(s) + "</li>";
        })
        .join("") +
      "</ul>" +
      (config && config.unsupported
        ? "<p class='unsupported'><strong>Unsupported:</strong> " +
          escapeHtml(config.unsupported.join(", ")) +
          "</p>"
        : "") +
      "</div>";
  }

  async function openVenture(id) {
    const ventures = root.__havkarVentures || [];
    const venture = ventures.find(function (v) {
      return v.id === id;
    });
    if (!venture) return;
    $("activeVentureId").value = venture.id;
    $("ventureNameInput").value = venture.name;
    $("ventureHeroInput").value = (venture.config && venture.config.heroTitle) || "";
    $("ventureSubInput").value = (venture.config && venture.config.heroSubtitle) || "";
    renderPreview(venture.config || {});
    showPanel("builder");
    setStatus("Workspace: " + venture.name);
    if (venture.is_aldo_pilot) {
      await refreshAldo(venture.id);
    }
    await refreshLedger(venture.id);
  }

  async function refreshLedger(ventureId) {
    const data = await api("ledger_summary", { venture_id: ventureId });
    const box = $("ledgerBox");
    if (!box) return;
    const s = data.summary;
    box.innerHTML =
      "<p class='sim-banner'>SIMULATED accounting · payouts OFF</p>" +
      "<dl>" +
      "<dt>Gross</dt><dd>" +
      (s.gross_cents / 100).toFixed(2) +
      " EUR</dd>" +
      "<dt>Eligible expenses</dt><dd>" +
      (s.eligible_expenses_cents / 100).toFixed(2) +
      " EUR</dd>" +
      "<dt>Net profit</dt><dd>" +
      (s.net_profit_cents / 100).toFixed(2) +
      " EUR</dd>" +
      "<dt>Proposed HAVKAR 70%</dt><dd>" +
      (s.proposed_havkar_cents / 100).toFixed(2) +
      " EUR</dd>" +
      "<dt>Proposed partner 30%</dt><dd>" +
      (s.proposed_partner_cents / 100).toFixed(2) +
      " EUR</dd></dl>" +
      "<p>" +
      escapeHtml(s.policy) +
      "</p>" +
      "<p>Agreement: " +
      escapeHtml((data.agreement && data.agreement.status) || "none") +
      "</p>";
  }

  async function refreshAldo(ventureId) {
    const box = $("aldoBox");
    if (!box) return;
    const data = await api("aldo_list_sessions", { venture_id: ventureId });
    box.hidden = false;
    box.innerHTML =
      "<p class='sim-banner'>TEST/SIMULATION — not real sensor data. Sensors not installed.</p>" +
      "<button type='button' id='aldoStartBtn'>Start simulation session</button>" +
      "<button type='button' id='aldoKickBtn' disabled>Record simulated kick</button>" +
      "<button type='button' id='aldoEndBtn' disabled>End session</button>" +
      "<div id='aldoSessionMeta'></div>" +
      "<ul>" +
      (data.sessions || [])
        .slice(0, 8)
        .map(function (s) {
          return (
            "<li>" +
            escapeHtml(s.player_display_name) +
            " · kicks " +
            s.kick_count +
            " · " +
            escapeHtml(s.mode) +
            "</li>"
          );
        })
        .join("") +
      "</ul>";
    let currentSession = null;
    $("aldoStartBtn").onclick = async function () {
      try {
        const started = await api("aldo_start_session", {
          venture_id: ventureId,
          player_display_name: "Pilot athlete"
        });
        currentSession = started.session;
        $("aldoKickBtn").disabled = false;
        $("aldoEndBtn").disabled = false;
        $("aldoSessionMeta").textContent =
          "Active SIM session " + currentSession.id + " — force/accuracy NOT measured";
        setStatus("Aldo simulation session started");
      } catch (e) {
        setStatus(e.message, true);
      }
    };
    $("aldoKickBtn").onclick = async function () {
      if (!currentSession) return;
      try {
        const kick = await api("aldo_record_kick", {
          session_id: currentSession.id,
          side: "unknown"
        });
        $("aldoSessionMeta").textContent =
          "Simulated kicks: " +
          kick.kick_count +
          " · measured_force=" +
          kick.measured_force +
          " · accuracy=" +
          kick.accuracy_score;
      } catch (e) {
        setStatus(e.message, true);
      }
    };
    $("aldoEndBtn").onclick = async function () {
      if (!currentSession) return;
      try {
        await api("aldo_end_session", { session_id: currentSession.id });
        currentSession = null;
        $("aldoKickBtn").disabled = true;
        $("aldoEndBtn").disabled = true;
        await refreshAldo(ventureId);
        setStatus("Aldo simulation session ended");
      } catch (e) {
        setStatus(e.message, true);
      }
    };
  }

  function bindForms() {
    document.querySelectorAll("[data-studio-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        showPanel(btn.getAttribute("data-studio-nav"));
      });
    });

    const ideaForm = $("ideaForm");
    if (ideaForm) {
      ideaForm.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        if (!(await ensureAuth())) return;
        try {
          await api("save_idea", {
            title: $("ideaTitle").value,
            category: $("ideaCategory").value,
            description: $("ideaDescription").value,
            intended_audience: $("ideaAudience").value,
            country_code: $("ideaCountry").value,
            budget_range: $("ideaBudget").value,
            development_goals: $("ideaGoals").value,
            preferred_business_model: $("ideaModel").value
          });
          ideaForm.reset();
          setStatus("Private idea draft saved");
          await refreshIdeas();
          showPanel("ideas");
        } catch (e) {
          setStatus(e.message, true);
        }
      });
    }

    document.body.addEventListener("click", async function (ev) {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.dataset.submitIdea) {
        try {
          await api("submit_idea", { id: t.dataset.submitIdea });
          setStatus("Idea submitted for private review");
          await refreshIdeas();
        } catch (e) {
          setStatus(e.message, true);
        }
      }
      if (t.dataset.template) {
        if (!(await ensureAuth())) return;
        try {
          const name = window.prompt("Venture name", "My HAVKAR venture");
          if (!name) return;
          const created = await api("create_venture", {
            template_id: t.dataset.template,
            name: name,
            is_aldo_pilot: t.dataset.template === "hardware_connected" || t.dataset.template === "sports_training"
          });
          setStatus("Venture created: " + created.venture.slug);
          await refreshVentures();
          showPanel("ventures");
        } catch (e) {
          setStatus(e.message, true);
        }
      }
      if (t.dataset.openVenture) {
        await openVenture(t.dataset.openVenture);
      }
      if (t.dataset.reviewVenture) {
        try {
          const result = await api("request_publish_review", {
            venture_id: t.dataset.reviewVenture
          });
          setStatus(result.message || "Review requested");
          await refreshVentures();
        } catch (e) {
          setStatus(e.message, true);
        }
      }
      if (t.dataset.aldoVenture) {
        await openVenture(t.dataset.aldoVenture);
        showPanel("builder");
      }
    });

    const saveBuilder = $("saveBuilderBtn");
    if (saveBuilder) {
      saveBuilder.addEventListener("click", async function () {
        const id = $("activeVentureId").value;
        if (!id) return;
        try {
          const updated = await api("update_venture_config", {
            venture_id: id,
            name: $("ventureNameInput").value,
            config: {
              heroTitle: $("ventureHeroInput").value,
              heroSubtitle: $("ventureSubInput").value
            }
          });
          renderPreview(updated.venture.config);
          setStatus("Config saved as version " + updated.version_number);
          await refreshVentures();
        } catch (e) {
          setStatus(e.message, true);
        }
      });
    }

    const addRev = $("addRevenueBtn");
    if (addRev) {
      addRev.addEventListener("click", async function () {
        const id = $("activeVentureId").value;
        if (!id) return;
        try {
          await api("add_simulated_ledger", {
            venture_id: id,
            entry_type: "gross_revenue",
            amount_cents: 10000,
            memo: "SIMULATED gross revenue +100 EUR"
          });
          await refreshLedger(id);
          setStatus("Simulated revenue added");
        } catch (e) {
          setStatus(e.message, true);
        }
      });
    }

    const addExp = $("addExpenseBtn");
    if (addExp) {
      addExp.addEventListener("click", async function () {
        const id = $("activeVentureId").value;
        if (!id) return;
        try {
          await api("add_simulated_ledger", {
            venture_id: id,
            entry_type: "eligible_expense",
            amount_cents: 2500,
            memo: "SIMULATED eligible expense +25 EUR"
          });
          await refreshLedger(id);
          setStatus("Simulated expense added");
        } catch (e) {
          setStatus(e.message, true);
        }
      });
    }

    const present = $("presentAgreementBtn");
    if (present) {
      present.addEventListener("click", async function () {
        const id = $("activeVentureId").value;
        if (!id) return;
        try {
          await api("present_agreement", { venture_id: id });
          await refreshLedger(id);
          setStatus("Agreement presented (inactive, payouts OFF)");
        } catch (e) {
          setStatus(e.message, true);
        }
      });
    }

    const accept = $("acceptAgreementBtn");
    if (accept) {
      accept.addEventListener("click", async function () {
        const id = $("activeVentureId").value;
        if (!id) return;
        try {
          await api("accept_agreement_pending_owner", {
            venture_id: id,
            informed_acceptance: true
          });
          await refreshLedger(id);
          setStatus("Partner acceptance recorded — awaiting owner approval");
        } catch (e) {
          setStatus(e.message, true);
        }
      });
    }
  }

  async function boot() {
    bindForms();
    showPanel("overview");
    try {
      await loadStatus();
      const token = await accessToken();
      if (token) {
        await refreshIdeas();
        await refreshVentures();
        setStatus("Signed in · Ideas private by default");
      } else {
        setStatus("Browse templates freely. Sign in to save ideas and ventures.");
      }
    } catch (e) {
      setStatus((e && e.message) || String(e), true);
    }
  }

  root.HAVKAR_IDEAS_STUDIO = {
    boot: boot,
    api: api,
    showPanel: showPanel
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
