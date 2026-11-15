/**
 * HAVKAR Ideas Portal + Studio API.
 * Payments, public publish, ownership transfer, and payouts stay OFF.
 */

const { createClient } = require("@supabase/supabase-js");
const {
  listTemplates,
  getTemplate,
  buildConfigFromTemplate
} = require("./venture-templates.cjs");
const {
  CREATE_BILLING_POLICY,
  quoteCreateUsage
} = require("./havkar-create-billing.cjs");

const IDEA_CATEGORIES = [
  "website",
  "restaurant",
  "shop",
  "marketplace",
  "community",
  "booking",
  "sports",
  "hardware",
  "dashboard",
  "other"
];

const FLAGS = Object.freeze({
  payments_enabled: false,
  public_publish_enabled: false,
  ownership_transfer_enabled: false,
  agreement_payouts_enabled: false,
  proposed_default_split: { havkar_bps: 7000, partner_bps: 3000 },
  note:
    "70/30 is a proposed net-profit model for jointly approved ventures only after signed agreement and owner approval. It does not replace marketplace fees."
});

function sendJson(res, status, body) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(status).json(body);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function sendError(res, status, error, extra) {
  return sendJson(res, status, Object.assign({ ok: false, error: error }, extra || {}));
}

function clip(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function bearerToken(req) {
  const header = req.headers && (req.headers.authorization || req.headers.Authorization);
  const value = Array.isArray(header) ? String(header[0] || "") : String(header || "");
  if (!value.startsWith("Bearer ")) return "";
  return value.slice(7).trim();
}

function supabaseEnvStatus() {
  const missing = [];
  if (!String(process.env.SUPABASE_URL || "").trim()) missing.push("SUPABASE_URL");
  if (!String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  return {
    configured: missing.length === 0,
    missing_env: missing,
    // Never expose values — presence only.
    supabase_url_present: !missing.includes("SUPABASE_URL"),
    service_role_present: !missing.includes("SUPABASE_SERVICE_ROLE_KEY")
  };
}

function createServiceClient() {
  const status = supabaseEnvStatus();
  if (!status.configured) return null;
  const url = String(process.env.SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function authenticate(req, supabase) {
  const token = bearerToken(req);
  if (!token || !supabase) return null;
  const result = await supabase.auth.getUser(token);
  if (result.error || !result.data || !result.data.user) return null;
  return result.data.user;
}

async function isPlatformOwner(supabase, userId) {
  // Service-role client has no end-user JWT, so caller_is_owner() is false.
  // Resolve against private owner identity when reachable; otherwise false.
  try {
    const { data, error } = await supabase
      .schema("havkar_private")
      .from("owner_identity")
      .select("user_id")
      .eq("singleton", true)
      .maybeSingle();
    if (!error && data && String(data.user_id) === String(userId)) {
      return true;
    }
  } catch (_e) {
    /* schema may be restricted */
  }
  return false;
}

function slugify(input) {
  return clip(input, 48)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "venture";
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_e) {
      return {};
    }
  }
  return typeof req.body === "object" ? req.body : {};
}

function actionOf(req, body) {
  return clip(body.action || (req.query && req.query.action) || "", 80);
}

async function writeAudit(supabase, row) {
  await supabase.from("venture_audit_events").insert(row);
}

async function handleStatus(res) {
  const backend = supabaseEnvStatus();
  return sendJson(res, 200, {
    ok: true,
    action: "ideas_studio_status",
    module: "havkar_create",
    product_name: "HAVKAR CREATE",
    layers: {
      ai: "havkar-ai.html",
      create: "ideas-studio.html",
      marketplace: "buy-sell.html"
    },
    flags: FLAGS,
    billing: CREATE_BILLING_POLICY,
    backend: backend,
    backend_configured: backend.configured,
    templates: listTemplates(),
    aldo_pilot: {
      name: "SPEED UP MY TOUCH",
      sensors: "not_installed",
      software: "simulation_foundation",
      safety_review: "required_before_field_deployment",
      football_2d_demo: "create-football-2d.html",
      football_2d_is_not_aldo_hardware: true
    },
    home_tiles_policy: "approved_15_tiles_unchanged",
    marketplace_fees_preserved: true,
    sandbox: {
      user_code_on_core: false,
      renderer: "havkar-create-runtime.js",
      isolation: "iframe_sandbox_trusted_renderer_only"
    },
    note:
      "Ephemeral analyze_idea (no idea_id) works without Supabase. Auth-backed idea/venture/Aldo actions require SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY on this deployment."
  });
}

function analyzeIdeaLocal(idea) {
  const text = String((idea && idea.description) || "");
  const category = String((idea && idea.category) || "other");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const complexity =
    words > 180 || category === "hardware" || category === "marketplace"
      ? "high"
      : words > 80
        ? "medium"
        : "starter";
  const suggestedTemplates = listTemplates()
    .filter(function (t) {
      return t.category === category || (category === "sports" && t.id.indexOf("game") >= 0);
    })
    .map(function (t) {
      return t.id;
    })
    .slice(0, 3);
  return {
    feasibility: complexity === "high" ? "needs_phased_build" : "feasible_with_templates",
    complexity: complexity,
    assumptions: [
      "Analysis is structured guidance, not a guaranteed business outcome.",
      "Live payments and public publish stay OFF until Owner authorization.",
      "Unsupported template features remain unsupported."
    ],
    recommended_next_steps: [
      "Save a private idea draft",
      "Create a venture from a supported template",
      "Use sandbox preview to edit content",
      "Submit for platform review before any marketplace listing"
    ],
    suggested_templates: suggestedTemplates,
    risks: [
      category === "hardware"
        ? "Hardware/sensor claims require calibration evidence (Aldo sensors not installed)."
        : "Scope creep beyond supported template capabilities.",
      "Legal/IP ownership remains with the submitter until a signed venture agreement."
    ],
    ai_mode: "local_structured_v1",
    logo_generation: "not_included_here_paid_ai_rules_apply"
  };
}

async function analyzeIdea(supabase, user, body, res) {
  const ideaId = clip(body.idea_id || body.id, 36);
  let idea = null;
  if (ideaId) {
    if (!supabase) {
      const backend = supabaseEnvStatus();
      return sendError(
        res,
        503,
        "Ideas Studio backend is not configured for persisted idea analysis.",
        backend
      );
    }
    if (!user) return sendError(res, 401, "Authentication required.");
    const { data, error } = await supabase
      .from("venture_ideas")
      .select("*")
      .eq("id", ideaId)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (error) return sendError(res, 500, error.message);
    if (!data) return sendError(res, 404, "Idea not found.");
    idea = data;
  } else {
    idea = {
      title: clip(body.title, 160),
      category: clip(body.category, 40) || "other",
      description: clip(body.description, 8000)
    };
    if (idea.description.length < 20) {
      return sendError(res, 400, "Provide idea_id or a description (20+ chars).");
    }
  }
  const analysis = analyzeIdeaLocal(idea);
  let audit_persisted = false;
  if (supabase && user) {
    try {
      await writeAudit(supabase, {
        idea_id: ideaId || null,
        actor_user_id: user.id,
        action: "idea_analyzed",
        detail: {
          complexity: analysis.complexity,
          ai_mode: analysis.ai_mode
        }
      });
      audit_persisted = true;
    } catch (_e) {
      audit_persisted = false;
    }
  }
  return sendJson(res, 200, {
    ok: true,
    action: "analyze_idea",
    mode: ideaId ? "persisted_idea" : "ephemeral",
    idea: {
      id: idea.id || null,
      title: idea.title,
      category: idea.category
    },
    analysis: analysis,
    audit_persisted: audit_persisted,
    backend_configured: !!(supabase && supabaseEnvStatus().configured),
    billing_note: "AI analysis may later consume CREATE credits; live charges remain OFF."
  });
}

async function billingQuote(res, body) {
  const quote = quoteCreateUsage(body.items || body.usage || []);
  if (!quote.ok) return sendError(res, 400, quote.error);
  return sendJson(res, 200, Object.assign({ action: "billing_quote" }, quote));
}

async function marketplacePrepare(supabase, user, body, res) {
  const ventureId = clip(body.venture_id, 36);
  const { data: member } = await supabase
    .from("venture_members")
    .select("role")
    .eq("venture_id", ventureId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member || !["owner", "editor"].includes(member.role)) {
    return sendError(res, 403, "Editor access required.");
  }
  const { data: venture, error } = await supabase
    .from("ventures")
    .select("*")
    .eq("id", ventureId)
    .maybeSingle();
  if (error || !venture) return sendError(res, 404, "Venture not found.");
  if (venture.status !== "approved_unpublished" && venture.status !== "pending_review") {
    return sendError(
      res,
      400,
      "Marketplace prepare requires pending_review or approved_unpublished status."
    );
  }
  const draft = {
    listing_surface: "marketplace",
    title: venture.name,
    source: "havkar_create",
    venture_id: venture.id,
    slug: venture.slug,
    public_publish_enabled: false,
    payments_enabled: false,
    buy_sell_path: "buy-sell.html",
    note:
      "Draft bridge only. No marketplace row is created until Owner authorizes publish wiring."
  };
  await writeAudit(supabase, {
    venture_id: ventureId,
    actor_user_id: user.id,
    action: "marketplace_prepare_draft",
    detail: draft
  });
  return sendJson(res, 200, {
    ok: true,
    action: "marketplace_prepare",
    draft: draft,
    created_listing: false,
    public_publish_enabled: false
  });
}

async function listIdeas(supabase, user, res, asReviewer, body) {
  let query = supabase
    .from("venture_ideas")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (!asReviewer) {
    query = query.eq("owner_user_id", user.id);
  }
  const category = clip((body && body.category) || "", 40);
  const status = clip((body && body.status) || "", 40);
  const q = clip((body && (body.q || body.search)) || "", 120).toLowerCase();
  if (category && IDEA_CATEGORIES.includes(category)) {
    query = query.eq("category", category);
  }
  if (
    status &&
    ["draft", "submitted", "in_review", "approved", "rejected", "withdrawn"].includes(
      status
    )
  ) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) return sendError(res, 500, error.message);
  let ideas = data || [];
  if (q) {
    ideas = ideas.filter(function (row) {
      const hay = (
        String(row.title || "") +
        " " +
        String(row.description || "") +
        " " +
        String(row.category || "")
      ).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  return sendJson(res, 200, {
    ok: true,
    action: "list_ideas",
    ideas: ideas,
    filters: { category: category || null, status: status || null, q: q || null },
    private_by_default: true
  });
}

async function deleteIdea(supabase, user, body, res) {
  const id = clip(body.id || body.idea_id, 36);
  if (!id) return sendError(res, 400, "Idea id required.");
  const { data: existing, error: findErr } = await supabase
    .from("venture_ideas")
    .select("id,owner_user_id,status,title")
    .eq("id", id)
    .maybeSingle();
  if (findErr) return sendError(res, 500, findErr.message);
  if (!existing || existing.owner_user_id !== user.id) {
    return sendError(res, 404, "Idea not found.");
  }
  if (!["draft", "rejected", "withdrawn"].includes(existing.status)) {
    return sendError(
      res,
      400,
      "Only draft/rejected/withdrawn ideas can be deleted. Withdraw submitted ideas first."
    );
  }
  const { error } = await supabase.from("venture_ideas").delete().eq("id", id);
  if (error) return sendError(res, 500, error.message);
  await writeAudit(supabase, {
    idea_id: null,
    actor_user_id: user.id,
    action: "idea_deleted",
    detail: { deleted_idea_id: id, title: existing.title }
  });
  return sendJson(res, 200, { ok: true, action: "delete_idea", deleted_id: id });
}

async function withdrawIdea(supabase, user, body, res) {
  const id = clip(body.id || body.idea_id, 36);
  if (!id) return sendError(res, 400, "Idea id required.");
  const { data: existing, error: findErr } = await supabase
    .from("venture_ideas")
    .select("*")
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (findErr) return sendError(res, 500, findErr.message);
  if (!existing) return sendError(res, 404, "Idea not found.");
  if (!["submitted", "in_review"].includes(existing.status)) {
    return sendError(res, 400, "Only submitted/in_review ideas can be withdrawn.");
  }
  const { data, error } = await supabase
    .from("venture_ideas")
    .update({ status: "withdrawn" })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return sendError(res, 500, error.message);
  await supabase.from("venture_idea_events").insert({
    idea_id: id,
    actor_user_id: user.id,
    from_status: existing.status,
    to_status: "withdrawn",
    note: clip(body.note, 500) || "Withdrawn by owner"
  });
  return sendJson(res, 200, { ok: true, action: "withdraw_idea", idea: data });
}

async function saveIdea(supabase, user, body, res) {
  const id = clip(body.id, 36);
  const payload = {
    title: clip(body.title, 160),
    category: clip(body.category, 40),
    description: clip(body.description, 8000),
    intended_audience: clip(body.intended_audience, 500),
    country_code: clip(body.country_code, 8).toUpperCase(),
    budget_range: clip(body.budget_range, 80),
    development_goals: clip(body.development_goals, 2000),
    preferred_business_model: clip(body.preferred_business_model, 500),
    media: Array.isArray(body.media) ? body.media.slice(0, 12) : []
  };

  if (payload.title.length < 3) return sendError(res, 400, "Title is too short.");
  if (!IDEA_CATEGORIES.includes(payload.category)) {
    return sendError(res, 400, "Invalid idea category.");
  }
  if (payload.description.length < 20) {
    return sendError(res, 400, "Description must be at least 20 characters.");
  }

  if (id) {
    const { data: existing, error: findErr } = await supabase
      .from("venture_ideas")
      .select("id,owner_user_id,status")
      .eq("id", id)
      .maybeSingle();
    if (findErr) return sendError(res, 500, findErr.message);
    if (!existing || existing.owner_user_id !== user.id) {
      return sendError(res, 404, "Idea not found.");
    }
    if (!["draft", "rejected", "withdrawn"].includes(existing.status)) {
      return sendError(res, 400, "Only draft/rejected/withdrawn ideas can be edited.");
    }
    const { data, error } = await supabase
      .from("venture_ideas")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return sendError(res, 500, error.message);
    await writeAudit(supabase, {
      idea_id: id,
      actor_user_id: user.id,
      action: "idea_updated",
      detail: { title: payload.title }
    });
    return sendJson(res, 200, { ok: true, action: "save_idea", idea: data });
  }

  const { data, error } = await supabase
    .from("venture_ideas")
    .insert(
      Object.assign({}, payload, {
        owner_user_id: user.id,
        status: "draft"
      })
    )
    .select("*")
    .single();
  if (error) return sendError(res, 500, error.message);
  await supabase.from("venture_idea_events").insert({
    idea_id: data.id,
    actor_user_id: user.id,
    from_status: null,
    to_status: "draft",
    note: "Idea draft created"
  });
  await writeAudit(supabase, {
    idea_id: data.id,
    actor_user_id: user.id,
    action: "idea_created",
    detail: { title: payload.title }
  });
  return sendJson(res, 200, { ok: true, action: "save_idea", idea: data });
}

async function submitIdea(supabase, user, body, res) {
  const id = clip(body.id, 36);
  if (!id) return sendError(res, 400, "Idea id required.");
  const { data: existing, error: findErr } = await supabase
    .from("venture_ideas")
    .select("*")
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (findErr) return sendError(res, 500, findErr.message);
  if (!existing) return sendError(res, 404, "Idea not found.");
  if (!["draft", "rejected", "withdrawn"].includes(existing.status)) {
    return sendError(res, 400, "Idea cannot be submitted from status " + existing.status);
  }
  const { data, error } = await supabase
    .from("venture_ideas")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      reviewer_notes: ""
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return sendError(res, 500, error.message);
  await supabase.from("venture_idea_events").insert({
    idea_id: id,
    actor_user_id: user.id,
    from_status: existing.status,
    to_status: "submitted",
    note: clip(body.note, 500) || "Submitted for review"
  });
  return sendJson(res, 200, { ok: true, action: "submit_idea", idea: data });
}

async function reviewIdea(supabase, user, body, res, owner) {
  if (!owner) return sendError(res, 403, "Only platform reviewers can moderate ideas.");
  const id = clip(body.id, 36);
  const decision = clip(body.decision, 20);
  if (!["approve", "reject", "in_review"].includes(decision)) {
    return sendError(res, 400, "decision must be approve, reject, or in_review.");
  }
  const map = {
    approve: "approved",
    reject: "rejected",
    in_review: "in_review"
  };
  const toStatus = map[decision];
  const { data: existing, error: findErr } = await supabase
    .from("venture_ideas")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (findErr) return sendError(res, 500, findErr.message);
  if (!existing) return sendError(res, 404, "Idea not found.");
  const { data, error } = await supabase
    .from("venture_ideas")
    .update({
      status: toStatus,
      reviewer_notes: clip(body.notes, 2000),
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return sendError(res, 500, error.message);
  await supabase.from("venture_idea_events").insert({
    idea_id: id,
    actor_user_id: user.id,
    from_status: existing.status,
    to_status: toStatus,
    note: clip(body.notes, 2000)
  });
  return sendJson(res, 200, { ok: true, action: "review_idea", idea: data });
}

async function createVenture(supabase, user, body, res) {
  const templateId = clip(body.template_id, 60);
  const built = buildConfigFromTemplate(templateId, body.config || {});
  if (!built.ok) return sendError(res, 400, built.error);
  const name = clip(body.name, 120) || built.template.name;
  let slug = slugify(body.slug || name);
  const ideaId = clip(body.idea_id, 36) || null;
  const isAldo = Boolean(body.is_aldo_pilot) || templateId === "hardware_connected";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const trySlug = attempt === 0 ? slug : slug + "-" + (attempt + 1);
    const insert = {
      created_by: user.id,
      idea_id: ideaId || null,
      slug: trySlug,
      name: name,
      template_id: templateId,
      status: "in_builder",
      config: built.config,
      subdomain_proposal: clip(body.subdomain_proposal || trySlug + ".havkar.online", 120),
      payments_enabled: false,
      public_publish_enabled: false,
      is_aldo_pilot: isAldo
    };
    const { data, error } = await supabase
      .from("ventures")
      .insert(insert)
      .select("*")
      .single();
    if (!error && data) {
      await supabase.from("venture_members").insert({
        venture_id: data.id,
        user_id: user.id,
        role: "owner"
      });
      await supabase.from("venture_app_versions").insert({
        venture_id: data.id,
        version_number: 1,
        config_snapshot: built.config,
        status: "draft",
        created_by: user.id
      });
      await supabase.from("venture_agreements").insert({
        venture_id: data.id,
        proposed_havkar_share_bps: 7000,
        proposed_partner_share_bps: 3000,
        status: "draft",
        payouts_enabled: false,
        legal_checklist: {
          ip_ownership: false,
          licensing: false,
          liabilities: false,
          termination: false,
          data_rights: false,
          dispute_resolution: false,
          payout_conditions: false,
          gdpr: false,
          italian_eu_company_review: false
        },
        notes:
          "Proposed 70/30 net-profit split is inactive until informed acceptance and owner approval."
      });
      if (isAldo) {
        await supabase.from("aldo_pilot_devices").insert({
          venture_id: data.id,
          device_label: "SPEED UP MY TOUCH rig #1",
          pairing_code: "ALDO-" + String(Date.now()).slice(-6),
          sensor_status: "not_installed",
          notes:
            "Physical hardware present; sensors and calibrated software not yet available. Simulation only."
        });
      }
      await writeAudit(supabase, {
        venture_id: data.id,
        idea_id: ideaId || null,
        actor_user_id: user.id,
        action: "venture_created",
        detail: { template_id: templateId, slug: trySlug }
      });
      return sendJson(res, 200, {
        ok: true,
        action: "create_venture",
        venture: data,
        unsupported: built.template.unsupported,
        flags: FLAGS
      });
    }
    if (error && !/duplicate|unique/i.test(error.message)) {
      return sendError(res, 500, error.message);
    }
  }
  return sendError(res, 409, "Could not allocate a unique venture slug.");
}

async function listVentures(supabase, user, res) {
  const { data: memberships, error: mErr } = await supabase
    .from("venture_members")
    .select("venture_id,role")
    .eq("user_id", user.id);
  if (mErr) return sendError(res, 500, mErr.message);
  const ids = (memberships || []).map(function (m) {
    return m.venture_id;
  });
  if (!ids.length) {
    return sendJson(res, 200, { ok: true, action: "list_ventures", ventures: [] });
  }
  const { data, error } = await supabase
    .from("ventures")
    .select("*")
    .in("id", ids)
    .order("updated_at", { ascending: false });
  if (error) return sendError(res, 500, error.message);
  return sendJson(res, 200, {
    ok: true,
    action: "list_ventures",
    ventures: data || [],
    memberships: memberships || []
  });
}

async function updateVentureConfig(supabase, user, body, res) {
  const ventureId = clip(body.venture_id, 36);
  if (!ventureId) return sendError(res, 400, "venture_id required.");
  const { data: member } = await supabase
    .from("venture_members")
    .select("role")
    .eq("venture_id", ventureId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member || !["owner", "editor"].includes(member.role)) {
    return sendError(res, 403, "Editor access required.");
  }
  const { data: venture, error: vErr } = await supabase
    .from("ventures")
    .select("*")
    .eq("id", ventureId)
    .single();
  if (vErr || !venture) return sendError(res, 404, "Venture not found.");
  const template = getTemplate(venture.template_id);
  const nextConfig = Object.assign({}, venture.config || {}, body.config || {}, {
    payments_enabled: false,
    public_publish_enabled: false,
    unsupported: template ? template.unsupported.slice() : []
  });
  const { data, error } = await supabase
    .from("ventures")
    .update({
      config: nextConfig,
      name: clip(body.name, 120) || venture.name,
      status: "in_builder"
    })
    .eq("id", ventureId)
    .select("*")
    .single();
  if (error) return sendError(res, 500, error.message);

  const { data: versions } = await supabase
    .from("venture_app_versions")
    .select("version_number")
    .eq("venture_id", ventureId)
    .order("version_number", { ascending: false })
    .limit(1);
  const nextVersion =
    versions && versions[0] ? Number(versions[0].version_number) + 1 : 1;
  await supabase.from("venture_app_versions").insert({
    venture_id: ventureId,
    version_number: nextVersion,
    config_snapshot: nextConfig,
    status: "draft",
    created_by: user.id
  });
  return sendJson(res, 200, {
    ok: true,
    action: "update_venture_config",
    venture: data,
    version_number: nextVersion
  });
}

async function requestPublishReview(supabase, user, body, res) {
  const ventureId = clip(body.venture_id, 36);
  const { data: member } = await supabase
    .from("venture_members")
    .select("role")
    .eq("venture_id", ventureId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member || !["owner", "editor"].includes(member.role)) {
    return sendError(res, 403, "Editor access required.");
  }
  const { data, error } = await supabase
    .from("ventures")
    .update({ status: "pending_review", public_publish_enabled: false })
    .eq("id", ventureId)
    .select("*")
    .single();
  if (error) return sendError(res, 500, error.message);
  const { data: versions } = await supabase
    .from("venture_app_versions")
    .select("id,version_number")
    .eq("venture_id", ventureId)
    .order("version_number", { ascending: false })
    .limit(1);
  if (versions && versions[0]) {
    await supabase
      .from("venture_app_versions")
      .update({ status: "pending_review" })
      .eq("id", versions[0].id);
  }
  await writeAudit(supabase, {
    venture_id: ventureId,
    actor_user_id: user.id,
    action: "publish_review_requested",
    detail: { note: "Public publish remains OFF until owner authorization." }
  });
  return sendJson(res, 200, {
    ok: true,
    action: "request_publish_review",
    venture: data,
    public_publish_enabled: false,
    message:
      "Submitted for platform review. Public publishing stays disabled until owner approval."
  });
}

async function moderateVenture(supabase, user, body, res, owner) {
  if (!owner) return sendError(res, 403, "Platform owner required.");
  const ventureId = clip(body.venture_id, 36);
  const decision = clip(body.decision, 20);
  if (!["approve_unpublished", "reject", "rollback"].includes(decision)) {
    return sendError(res, 400, "Invalid moderation decision.");
  }
  let status = "approved_unpublished";
  let versionStatus = "approved";
  if (decision === "reject") {
    status = "rejected";
    versionStatus = "rejected";
  }
  if (decision === "rollback") {
    status = "in_builder";
    versionStatus = "rolled_back";
  }
  const { data, error } = await supabase
    .from("ventures")
    .update({
      status: status,
      public_publish_enabled: false,
      payments_enabled: false
    })
    .eq("id", ventureId)
    .select("*")
    .single();
  if (error) return sendError(res, 500, error.message);
  const { data: versions } = await supabase
    .from("venture_app_versions")
    .select("id")
    .eq("venture_id", ventureId)
    .order("version_number", { ascending: false })
    .limit(1);
  if (versions && versions[0]) {
    await supabase
      .from("venture_app_versions")
      .update({
        status: versionStatus,
        review_notes: clip(body.notes, 2000)
      })
      .eq("id", versions[0].id);
  }
  return sendJson(res, 200, {
    ok: true,
    action: "moderate_venture",
    venture: data,
    public_publish_enabled: false
  });
}

function computeNetProfit(entries) {
  let gross = 0;
  let expenses = 0;
  (entries || []).forEach(function (e) {
    if (e.entry_type === "gross_revenue") gross += Number(e.amount_cents) || 0;
    if (e.entry_type === "eligible_expense") expenses += Number(e.amount_cents) || 0;
  });
  const net = gross - expenses;
  const havkar = Math.floor(net * 0.7);
  const partner = net - havkar;
  return {
    gross_cents: gross,
    eligible_expenses_cents: expenses,
    net_profit_cents: net,
    proposed_havkar_cents: Math.max(0, havkar),
    proposed_partner_cents: Math.max(0, partner),
    simulated: true,
    payouts_enabled: false,
    policy:
      "Net profit = gross revenue − refunds/taxes/payment costs/infrastructure/agreed operating costs (policy draft)."
  };
}

async function ledgerSummary(supabase, user, body, res) {
  const ventureId = clip(body.venture_id, 36);
  const { data: member } = await supabase
    .from("venture_members")
    .select("role")
    .eq("venture_id", ventureId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return sendError(res, 403, "Not a venture member.");
  const { data: entries, error } = await supabase
    .from("venture_ledger_entries")
    .select("*")
    .eq("venture_id", ventureId)
    .order("created_at", { ascending: false });
  if (error) return sendError(res, 500, error.message);
  const { data: agreement } = await supabase
    .from("venture_agreements")
    .select("*")
    .eq("venture_id", ventureId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return sendJson(res, 200, {
    ok: true,
    action: "ledger_summary",
    entries: entries || [],
    summary: computeNetProfit(entries || []),
    agreement: agreement || null,
    flags: FLAGS
  });
}

async function addSimulatedLedger(supabase, user, body, res) {
  const ventureId = clip(body.venture_id, 36);
  const entryType = clip(body.entry_type, 40);
  const amount = Number(body.amount_cents);
  if (!["gross_revenue", "eligible_expense"].includes(entryType)) {
    return sendError(res, 400, "Only simulated gross_revenue or eligible_expense allowed.");
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) {
    return sendError(res, 400, "Invalid amount_cents.");
  }
  const { data: member } = await supabase
    .from("venture_members")
    .select("role")
    .eq("venture_id", ventureId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member || !["owner", "editor"].includes(member.role)) {
    return sendError(res, 403, "Editor access required.");
  }
  const { data, error } = await supabase
    .from("venture_ledger_entries")
    .insert({
      venture_id: ventureId,
      entry_type: entryType,
      amount_cents: Math.floor(amount),
      currency: clip(body.currency || "EUR", 3).toUpperCase() || "EUR",
      memo: clip(body.memo, 300) || "SIMULATED ledger entry",
      is_simulated: true,
      created_by: user.id
    })
    .select("*")
    .single();
  if (error) return sendError(res, 500, error.message);
  return sendJson(res, 200, {
    ok: true,
    action: "add_simulated_ledger",
    entry: data,
    payouts_enabled: false
  });
}

async function presentAgreement(supabase, user, body, res) {
  const ventureId = clip(body.venture_id, 36);
  const { data: member } = await supabase
    .from("venture_members")
    .select("role")
    .eq("venture_id", ventureId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member || member.role !== "owner") {
    return sendError(res, 403, "Venture owner required.");
  }
  const { data, error } = await supabase
    .from("venture_agreements")
    .update({
      status: "presented",
      payouts_enabled: false,
      notes: clip(
        body.notes,
        2000
      ) || "Presented for informed review. Not active. No payouts."
    })
    .eq("venture_id", ventureId)
    .select("*")
    .maybeSingle();
  if (error) return sendError(res, 500, error.message);
  return sendJson(res, 200, {
    ok: true,
    action: "present_agreement",
    agreement: data,
    active: false,
    payouts_enabled: false
  });
}

async function acceptAgreementPendingOwner(supabase, user, body, res) {
  const ventureId = clip(body.venture_id, 36);
  const { data: member } = await supabase
    .from("venture_members")
    .select("role")
    .eq("venture_id", ventureId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return sendError(res, 403, "Not a venture member.");
  if (!body.informed_acceptance) {
    return sendError(res, 400, "informed_acceptance must be true.");
  }
  const { data, error } = await supabase
    .from("venture_agreements")
    .update({
      status: "partner_accepted_pending_owner",
      partner_accepted_at: new Date().toISOString(),
      payouts_enabled: false
    })
    .eq("venture_id", ventureId)
    .select("*")
    .maybeSingle();
  if (error) return sendError(res, 500, error.message);
  return sendJson(res, 200, {
    ok: true,
    action: "accept_agreement_pending_owner",
    agreement: data,
    message: "Partner acceptance recorded. Owner approval and legal activation still required.",
    payouts_enabled: false
  });
}

async function aldoStartSession(supabase, user, body, res) {
  const ventureId = clip(body.venture_id, 36);
  const { data: venture } = await supabase
    .from("ventures")
    .select("id,is_aldo_pilot")
    .eq("id", ventureId)
    .maybeSingle();
  if (!venture || !venture.is_aldo_pilot) {
    return sendError(res, 400, "Aldo pilot venture required.");
  }
  const { data: member } = await supabase
    .from("venture_members")
    .select("role")
    .eq("venture_id", ventureId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return sendError(res, 403, "Not a venture member.");
  const { data: devices } = await supabase
    .from("aldo_pilot_devices")
    .select("*")
    .eq("venture_id", ventureId)
    .limit(1);
  const device = devices && devices[0] ? devices[0] : null;
  const { data: session, error } = await supabase
    .from("aldo_training_sessions")
    .insert({
      venture_id: ventureId,
      device_id: device ? device.id : null,
      player_user_id: user.id,
      player_display_name: clip(body.player_display_name, 80) || "Player",
      mode: "simulation",
      notes: "TEST/SIMULATION — not real sensor data"
    })
    .select("*")
    .single();
  if (error) return sendError(res, 500, error.message);
  await supabase.from("aldo_session_events").insert({
    session_id: session.id,
    event_type: "session_start",
    source: "simulation",
    payload: { label: "TEST/SIMULATION", hardware_sensors: "not_installed" }
  });
  return sendJson(res, 200, {
    ok: true,
    action: "aldo_start_session",
    session: session,
    device: device,
    simulation: true,
    warning: "All Aldo events are TEST/SIMULATION until sensors are installed and calibrated."
  });
}

async function aldoRecordKick(supabase, user, body, res) {
  const sessionId = clip(body.session_id, 36);
  const { data: session, error: sErr } = await supabase
    .from("aldo_training_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (sErr || !session) return sendError(res, 404, "Session not found.");
  if (session.mode !== "simulation") {
    return sendError(res, 400, "Live sensor mode is unavailable.");
  }
  const side = clip(body.side, 10);
  if (side && !["left", "right", "unknown"].includes(side)) {
    return sendError(res, 400, "side must be left, right, or unknown.");
  }
  const payload = {
    label: "TEST/SIMULATION",
    contact: true,
    side: side || "unknown",
    timestamp_ms: Date.now()
  };
  // Intentionally omit force_newtons and accuracy_score — not inventable without sensors.
  const { data: event, error } = await supabase
    .from("aldo_session_events")
    .insert({
      session_id: sessionId,
      event_type: "kick_contact",
      source: "simulation",
      payload: payload
    })
    .select("*")
    .single();
  if (error) return sendError(res, 500, error.message);
  const kickCount = Number(session.kick_count || 0) + 1;
  await supabase
    .from("aldo_training_sessions")
    .update({ kick_count: kickCount })
    .eq("id", sessionId);
  return sendJson(res, 200, {
    ok: true,
    action: "aldo_record_kick",
    event: event,
    kick_count: kickCount,
    simulation: true,
    measured_force: null,
    accuracy_score: null,
    note: "Force/accuracy scoring requires calibrated sensors — not available."
  });
}

async function aldoEndSession(supabase, user, body, res) {
  const sessionId = clip(body.session_id, 36);
  const { data: session } = await supabase
    .from("aldo_training_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return sendError(res, 404, "Session not found.");
  const ended = new Date().toISOString();
  const duration = Math.max(
    0,
    Date.parse(ended) - Date.parse(session.started_at)
  );
  const { data, error } = await supabase
    .from("aldo_training_sessions")
    .update({ ended_at: ended, duration_ms: duration })
    .eq("id", sessionId)
    .select("*")
    .single();
  if (error) return sendError(res, 500, error.message);
  await supabase.from("aldo_session_events").insert({
    session_id: sessionId,
    event_type: "session_end",
    source: "simulation",
    payload: { label: "TEST/SIMULATION", duration_ms: duration }
  });
  return sendJson(res, 200, {
    ok: true,
    action: "aldo_end_session",
    session: data,
    simulation: true
  });
}

async function aldoListSessions(supabase, user, body, res) {
  const ventureId = clip(body.venture_id, 36);
  const { data: member } = await supabase
    .from("venture_members")
    .select("role")
    .eq("venture_id", ventureId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return sendError(res, 403, "Not a venture member.");
  const { data, error } = await supabase
    .from("aldo_training_sessions")
    .select("*")
    .eq("venture_id", ventureId)
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) return sendError(res, 500, error.message);
  return sendJson(res, 200, {
    ok: true,
    action: "aldo_list_sessions",
    sessions: data || [],
    simulation_banner: "TEST/SIMULATION data only"
  });
}

async function handleIdeasStudioRequest(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end("");
    return;
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.");
  }

  const body = parseBody(req);
  const action = actionOf(req, body) || "ideas_studio_status";

  if (
    action === "ideas_studio_status" ||
    action === "status" ||
    action === "list_templates" ||
    action === "billing_quote"
  ) {
    if (action === "list_templates") {
      return sendJson(res, 200, {
        ok: true,
        action: "list_templates",
        templates: listTemplates(),
        flags: FLAGS
      });
    }
    if (action === "billing_quote") {
      return billingQuote(res, body);
    }
    return handleStatus(res);
  }

  // Ephemeral AI analysis needs no Supabase when the client sends title/description.
  if (action === "analyze_idea") {
    const supabase = createServiceClient();
    const user = supabase ? await authenticate(req, supabase) : null;
    return analyzeIdea(supabase, user, body, res);
  }

  const backend = supabaseEnvStatus();
  const supabase = createServiceClient();
  if (!supabase) {
    return sendError(
      res,
      503,
      "Ideas Studio backend is not configured.",
      backend
    );
  }

  const user = await authenticate(req, supabase);
  if (!user) return sendError(res, 401, "Authentication required.");
  const owner = await isPlatformOwner(supabase, user.id);

  switch (action) {
    case "list_ideas":
      return listIdeas(supabase, user, res, false, body);
    case "list_ideas_review_queue":
      return listIdeas(supabase, user, res, owner, body);
    case "save_idea":
      return saveIdea(supabase, user, body, res);
    case "delete_idea":
      return deleteIdea(supabase, user, body, res);
    case "withdraw_idea":
      return withdrawIdea(supabase, user, body, res);
    case "submit_idea":
      return submitIdea(supabase, user, body, res);
    case "review_idea":
      return reviewIdea(supabase, user, body, res, owner);
    case "create_venture":
      return createVenture(supabase, user, body, res);
    case "list_ventures":
      return listVentures(supabase, user, res);
    case "update_venture_config":
      return updateVentureConfig(supabase, user, body, res);
    case "request_publish_review":
      return requestPublishReview(supabase, user, body, res);
    case "moderate_venture":
      return moderateVenture(supabase, user, body, res, owner);
    case "ledger_summary":
      return ledgerSummary(supabase, user, body, res);
    case "add_simulated_ledger":
      return addSimulatedLedger(supabase, user, body, res);
    case "present_agreement":
      return presentAgreement(supabase, user, body, res);
    case "accept_agreement_pending_owner":
      return acceptAgreementPendingOwner(supabase, user, body, res);
    case "aldo_start_session":
      return aldoStartSession(supabase, user, body, res);
    case "aldo_record_kick":
      return aldoRecordKick(supabase, user, body, res);
    case "aldo_end_session":
      return aldoEndSession(supabase, user, body, res);
    case "aldo_list_sessions":
      return aldoListSessions(supabase, user, body, res);
    case "marketplace_prepare":
      return marketplacePrepare(supabase, user, body, res);
    default:
      return sendError(res, 400, "Unknown ideas studio action.");
  }
}

module.exports = {
  handleIdeasStudioRequest,
  FLAGS,
  listTemplates,
  buildConfigFromTemplate,
  computeNetProfit,
  IDEA_CATEGORIES,
  supabaseEnvStatus,
  analyzeIdeaLocal
};
