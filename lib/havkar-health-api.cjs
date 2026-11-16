/**
 * HAVKAR Global Health Platform API.
 * Patients free. Live doctor/pharmacy billing gated OFF.
 * Never invents providers or medical advice.
 */

"use strict";

const { createClient } = require("@supabase/supabase-js");
const {
  HEALTH_CATEGORIES,
  subscriptionCatalog,
  rankingMethodology,
  platformRoleNotice,
  healthLiveBillingEnabled
} = require("./havkar-health.cjs");
const { isOwnerIdentity } = require("./owner-eur1-checkout.cjs");
const {
  telehealthStatus,
  createTelehealthSession,
  endTelehealthSession
} = require("./telehealth-adapter.cjs");

/** Curated encyclopedia stubs with official regulator links — not a prescription. */
const MEDICINE_ENTRIES = Object.freeze([
  {
    id: "paracetamol",
    generic_name: "Paracetamol",
    brand_examples: ["Panadol", "Tachipirina"],
    active_ingredients: ["paracetamol"],
    approved_indications:
      "Short-term symptomatic relief of mild to moderate pain and fever (per local product information).",
    contraindications: "Hypersensitivity to paracetamol; severe hepatic impairment where labeled.",
    side_effects: "Rare hypersensitivity; overdose risk of serious liver injury.",
    interactions: "May interact with other hepatotoxic agents; follow local SmPC.",
    pregnancy_pediatric:
      "Use only as labeled; consult a licensed clinician. Not personalized dosing advice.",
    sources: [
      {
        name: "EMA — Paracetamol-containing medicinal products",
        url: "https://www.ema.europa.eu/en/medicines/human/referrals/paracetamol-containing-medicinal-products"
      },
      {
        name: "AIFA — Agenzia Italiana del Farmaco",
        url: "https://www.aifa.gov.it/"
      }
    ],
    last_verified_update: "2026-11-15",
    disclaimer:
      "Informational only. Not a diagnosis, prescription or personalized dosing recommendation. HAVKAR does not sell medicines."
  },
  {
    id: "ibuprofen",
    generic_name: "Ibuprofen",
    brand_examples: ["Nurofen", "Moment"],
    active_ingredients: ["ibuprofen"],
    approved_indications:
      "Short-term symptomatic treatment of mild to moderate pain and fever where authorized.",
    contraindications:
      "Active peptic ulcer/bleeding, severe heart failure, hypersensitivity to NSAIDs where labeled.",
    side_effects: "GI irritation/bleeding risk; cardiovascular and renal warnings per SmPC.",
    interactions: "Anticoagulants, other NSAIDs, certain antihypertensives — see SmPC.",
    pregnancy_pediatric:
      "Restricted in later pregnancy per product labeling; pediatric use only as labeled.",
    sources: [
      {
        name: "EMA medicines search",
        url: "https://www.ema.europa.eu/en/medicines"
      },
      {
        name: "AIFA",
        url: "https://www.aifa.gov.it/"
      }
    ],
    last_verified_update: "2026-11-15",
    disclaimer:
      "Informational only. Not a diagnosis, prescription or personalized dosing recommendation. HAVKAR does not sell medicines."
  }
]);

function env(name) {
  return String(process.env[name] || "").trim();
}

function getAdminClient() {
  const url = env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL");
  const service =
    env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_KEY");
  if (!url || !service) {
    return { ok: false, error: "supabase_config_missing" };
  }
  return {
    ok: true,
    client: createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  };
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function actionOf(req) {
  return String(
    (req.query && req.query.action) ||
      (req.body && req.body.action) ||
      "health_status"
  ).trim();
}

function bodyOf(req) {
  return (req && req.body) || {};
}

function bearerToken(req) {
  const auth = String((req && req.headers && req.headers.authorization) || "");
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
}

async function authenticateBearer(req, db) {
  const token = bearerToken(req);
  if (!token) return { ok: false, error: "missing_bearer_token", httpStatus: 401 };
  const { data, error } = await db.auth.getUser(token);
  if (error || !data || !data.user) {
    return { ok: false, error: "invalid_or_expired_session", httpStatus: 401 };
  }
  return { ok: true, user: data.user };
}

function categoryById(id) {
  return HEALTH_CATEGORIES.find((c) => c.id === id) || null;
}

function normalizeProviderInsert(payload, userId) {
  const categoryId = String(payload.category_id || "").trim();
  const cat = categoryById(categoryId);
  if (!cat) return { ok: false, error: "invalid_category_id" };
  const displayName = String(payload.display_name || "").trim();
  if (displayName.length < 2) return { ok: false, error: "display_name_required" };

  const providerKind =
    cat.group === "pharmacy"
      ? "pharmacy"
      : cat.group === "doctors"
        ? "doctor"
        : cat.group === "herbal"
          ? "herbal"
          : cat.group === "diagnostics"
            ? "diagnostics"
            : cat.group === "travel"
              ? "travel"
              : cat.group === "information"
                ? "information"
                : cat.group === "care"
                  ? "care"
                  : "facility";

  const subscriptionRequired =
    cat.subscription_required === false
      ? false
      : ["gp", "specialist", "surgeon", "dentist", "psychiatrist", "psychologist", "cosmetic", "hair_transplant", "plastic", "fertility", "rare_disease", "pharmacy", "pharmacy_24h"].indexOf(categoryId) !== -1;

  return {
    ok: true,
    row: {
      user_id: userId,
      display_name: displayName.slice(0, 200),
      category_id: categoryId,
      provider_kind: providerKind,
      specialties: Array.isArray(payload.specialties)
        ? payload.specialties.map((s) => String(s).slice(0, 80)).slice(0, 20)
        : [],
      languages: Array.isArray(payload.languages)
        ? payload.languages.map((s) => String(s).slice(0, 16)).slice(0, 20)
        : [],
      country_code: String(payload.country_code || "")
        .trim()
        .toUpperCase()
        .slice(0, 2) || null,
      region: String(payload.region || "").trim().slice(0, 120) || null,
      city: String(payload.city || "").trim().slice(0, 120) || null,
      address: String(payload.address || "").trim().slice(0, 300) || null,
      latitude:
        payload.latitude != null && Number.isFinite(Number(payload.latitude))
          ? Number(payload.latitude)
          : null,
      longitude:
        payload.longitude != null && Number.isFinite(Number(payload.longitude))
          ? Number(payload.longitude)
          : null,
      license_number: String(payload.license_number || "").trim().slice(0, 120) || null,
      license_jurisdiction:
        String(payload.license_jurisdiction || "").trim().slice(0, 120) || null,
      license_document_path:
        String(payload.license_document_path || "").trim().slice(0, 500) || null,
      organization_legal_name:
        String(payload.organization_legal_name || "").trim().slice(0, 200) || null,
      business_registration_id:
        String(payload.business_registration_id || "").trim().slice(0, 120) || null,
      license_status: "pending",
      bio: String(payload.bio || "").trim().slice(0, 4000) || null,
      website: String(payload.website || "").trim().slice(0, 300) || null,
      phone: String(payload.phone || "").trim().slice(0, 60) || null,
      accepts_insurance:
        typeof payload.accepts_insurance === "boolean"
          ? payload.accepts_insurance
          : null,
      accessibility_notes:
        String(payload.accessibility_notes || "").trim().slice(0, 1000) || null,
      self_reported_stats: {
        label: "self_reported_not_independently_verified",
        values: payload.self_reported_stats && typeof payload.self_reported_stats === "object"
          ? payload.self_reported_stats
          : {}
      },
      publication_status: "pending_review",
      regulated: Boolean(cat.regulated),
      subscription_required: subscriptionRequired
    }
  };
}

function categoryIdsForGroup(group) {
  return HEALTH_CATEGORIES.filter((c) => c.group === group).map((c) => c.id);
}

async function searchProviders(db, filters) {
  let q = db
    .from("health_providers")
    .select(
      "id,display_name,category_id,provider_kind,specialties,languages,country_code,region,city,address,latitude,longitude,license_status,regulated,accepts_insurance,accessibility_notes,publication_status"
    )
    .eq("publication_status", "published")
    .limit(100);

  if (filters.category_id) q = q.eq("category_id", filters.category_id);
  if (filters.category_group) {
    const ids = categoryIdsForGroup(filters.category_group);
    if (ids.length) q = q.in("category_id", ids);
  }
  if (filters.country_code) q = q.eq("country_code", filters.country_code);
  if (filters.region) q = q.ilike("region", "%" + filters.region + "%");
  if (filters.city) q = q.ilike("city", "%" + filters.city + "%");
  if (filters.verified_only) q = q.eq("license_status", "verified");
  if (filters.accepts_insurance === true) q = q.eq("accepts_insurance", true);
  if (filters.language) {
    q = q.contains("languages", [filters.language]);
  }
  if (filters.q) {
    const term = "%" + filters.q + "%";
    q = q.or(
      "display_name.ilike." +
        term +
        ",city.ilike." +
        term +
        ",category_id.ilike." +
        term
    );
  }

  const { data, error } = await q;
  if (error) {
    if (
      /relation .* does not exist/i.test(error.message || "") ||
      error.code === "42P01"
    ) {
      return { ok: true, results: [], note: "health_providers_table_pending_migration" };
    }
    return { ok: false, error: error.message || "search_failed" };
  }

  let rows = data || [];
  if (filters.accessibility_required) {
    rows = rows.filter(
      (r) => r.accessibility_notes && String(r.accessibility_notes).trim()
    );
  }
  if (
    filters.latitude != null &&
    filters.longitude != null &&
    Number.isFinite(Number(filters.latitude)) &&
    Number.isFinite(Number(filters.longitude)) &&
    filters.distance_km != null
  ) {
    const lat = Number(filters.latitude);
    const lng = Number(filters.longitude);
    const maxKm = Number(filters.distance_km) || 50;
    rows = rows.filter((r) => {
      if (r.latitude == null || r.longitude == null) return false;
      const dlat = (Number(r.latitude) - lat) * 111;
      const dlng =
        (Number(r.longitude) - lng) * 111 * Math.cos((lat * Math.PI) / 180);
      return Math.sqrt(dlat * dlat + dlng * dlng) <= maxKm;
    });
  }

  if (filters.has_open_slots) {
    const ids = rows.map((r) => r.id);
    if (!ids.length) return { ok: true, results: [] };
    const { data: slots, error: sErr } = await db
      .from("health_availability_slots")
      .select("provider_id")
      .in("provider_id", ids)
      .eq("is_open", true)
      .gt("starts_at", new Date().toISOString());
    if (sErr) {
      if (/relation .* does not exist/i.test(sErr.message || "")) {
        return { ok: true, results: [], note: "availability_table_pending_migration" };
      }
      return { ok: false, error: sErr.message };
    }
    const open = new Set((slots || []).map((s) => s.provider_id));
    rows = rows.filter((r) => open.has(r.id));
  }
  return { ok: true, results: rows };
}

function rankingScore(row) {
  const reviewCount = Number(row.review_count) || 0;
  const avg = Number(row.avg_rating) || 0;
  const verifiedBoost = row.license_status === "verified" ? 2 : 0;
  const confidence =
    reviewCount <= 0 ? 0 : Math.min(1, Math.log10(reviewCount + 1) / 2);
  // Bayesian-ish shrink toward neutral 3.0; never boost by subscription.
  const shrunk = 3 + (avg - 3) * confidence;
  return Number((shrunk + verifiedBoost * 0.15).toFixed(4));
}

async function ownProvider(db, userId, providerId) {
  const { data, error } = await db
    .from("health_providers")
    .select("id,user_id,category_id,publication_status,license_status")
    .eq("id", providerId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "provider_not_found" };
  if (data.user_id !== userId) return { ok: false, error: "forbidden" };
  return { ok: true, provider: data };
}

async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const action = actionOf(req);
  const body = bodyOf(req);

  if (action === "health_status" || action === "health_catalog") {
    return send(res, 200, {
      ok: true,
      action,
      module: "health",
      categories: HEALTH_CATEGORIES,
      subscriptions: subscriptionCatalog(process.env),
      ranking: rankingMethodology(),
      platform_role: platformRoleNotice(),
      patients_platform_fee: "free",
      live_billing_enabled: healthLiveBillingEnabled(process.env),
      video_consultations: {
        status: "BLOCKED",
        reason:
          "Secure clinical voice/video requires contracted telehealth infrastructure, jurisdiction gating and explicit consent flows before activation."
      },
      emergency:
        "HAVKAR is not an emergency provider. Contact local emergency services for urgent care."
    });
  }

  if (action === "health_subscriptions") {
    return send(res, 200, subscriptionCatalog(process.env));
  }

  if (action === "health_ranking_method") {
    return send(res, 200, rankingMethodology());
  }

  if (action === "health_medicine_search") {
    const q = String(body.q || (req.query && req.query.q) || "")
      .trim()
      .toLowerCase();
    const results = !q
      ? MEDICINE_ENTRIES.slice()
      : MEDICINE_ENTRIES.filter((e) => {
          const blob = (
            e.generic_name +
            " " +
            (e.brand_examples || []).join(" ") +
            " " +
            (e.active_ingredients || []).join(" ")
          ).toLowerCase();
          return blob.indexOf(q) !== -1;
        });
    return send(res, 200, {
      ok: true,
      action: "health_medicine_search",
      sells_medicines: false,
      autonomous_diagnosis: false,
      results,
      empty_note:
        results.length === 0
          ? "No curated encyclopedia entry matches. HAVKAR does not invent medicines or cure claims."
          : null
    });
  }

  if (action === "health_travel_search") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) {
      return send(res, 200, {
        ok: true,
        action: "health_travel_search",
        results: [],
        note: "Directory empty until verified medical-travel providers are published. No fabricated destinations or prices."
      });
    }
    const filters = {
      category_id: "medical_travel",
      country_code: String(body.destination_country || body.country_code || "")
        .trim()
        .toUpperCase()
        .slice(0, 2) || null,
      q: String(body.specialty || body.q || "").trim() || null,
      verified_only: body.verified_only !== false
    };
    const found = await searchProviders(dbWrap.client, filters);
    if (!found.ok) return send(res, 500, { ok: false, error: found.error });
    return send(res, 200, {
      ok: true,
      action: "health_travel_search",
      results: found.results || [],
      note:
        "Provider-reported costs and visas are never fabricated. Follow-up and documentation requirements must come from the verified provider."
    });
  }

  if (action === "health_search") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) {
      return send(res, 200, {
        ok: true,
        action: "health_search",
        patients_platform_fee: "free",
        results: [],
        note: "Search ready. No invented providers. Publish verified providers after migration + review."
      });
    }
    const filters = {
      q: String(body.q || "").trim() || null,
      city: String(body.city || "").trim() || null,
      region: String(body.region || "").trim() || null,
      country_code: String(body.country_code || "")
        .trim()
        .toUpperCase()
        .slice(0, 2) || null,
      category_id: String(body.category_id || "").trim() || null,
      category_group: String(body.category_group || "").trim() || null,
      language: String(body.language || "").trim() || null,
      verified_only: Boolean(body.verified_only),
      accepts_insurance: body.accepts_insurance === true,
      accessibility_required: body.accessibility_required === true,
      has_open_slots: body.has_open_slots === true,
      latitude: body.latitude,
      longitude: body.longitude,
      distance_km: body.distance_km != null ? Number(body.distance_km) : null
    };
    const found = await searchProviders(dbWrap.client, filters);
    if (!found.ok) return send(res, 500, { ok: false, error: found.error });
    return send(res, 200, {
      ok: true,
      action: "health_search",
      patients_platform_fee: "free",
      results: found.results || [],
      note: found.note || null
    });
  }

  if (action === "health_provider_get") {
    const id = String(body.id || (req.query && req.query.id) || "").trim();
    if (!id) return send(res, 400, { ok: false, error: "id_required" });
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const { data, error } = await dbWrap.client
      .from("health_providers")
      .select(
        "id,display_name,category_id,provider_kind,specialties,languages,country_code,region,city,address,latitude,longitude,license_status,license_jurisdiction,regulated,bio,website,accepts_insurance,accessibility_notes,self_reported_stats,publication_status"
      )
      .eq("id", id)
      .eq("publication_status", "published")
      .maybeSingle();
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return send(res, 404, { ok: false, error: "provider_not_found" });
      }
      return send(res, 500, { ok: false, error: error.message });
    }
    if (!data) return send(res, 404, { ok: false, error: "provider_not_found" });
    return send(res, 200, {
      ok: true,
      provider: data,
      self_reported_label:
        "Any self-reported statistics are provider-declared and not independently verified by HAVKAR."
    });
  }

  if (action === "health_provider_register") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });
    const prepared = normalizeProviderInsert(body, auth.user.id);
    if (!prepared.ok) return send(res, 400, { ok: false, error: prepared.error });
    const { data, error } = await dbWrap.client
      .from("health_providers")
      .insert(prepared.row)
      .select("id,publication_status,license_status,subscription_required,category_id")
      .single();
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return send(res, 503, {
          ok: false,
          error: "health_providers_migration_required",
          note: "Migration is in repo; not silently applied to production from this handler."
        });
      }
      return send(res, 500, { ok: false, error: error.message });
    }
    return send(res, 200, {
      ok: true,
      action: "health_provider_register",
      provider: data,
      billing: {
        live_billing_enabled: false,
        charge_allowed_now: false,
        note: "Subscription catalog is proposed only. No automatic charge."
      }
    });
  }

  if (action === "health_appointment_request") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });

    const providerId = String(body.provider_id || "").trim();
    const startsAt = String(body.starts_at || "").trim();
    const endsAt = String(body.ends_at || "").trim();
    const modality = String(body.modality || "in_person").trim();
    if (!providerId || !startsAt || !endsAt) {
      return send(res, 400, { ok: false, error: "provider_and_time_required" });
    }
    if (["voice", "video"].indexOf(modality) !== -1) {
      return send(res, 409, {
        ok: false,
        error: "telehealth_blocked",
        status: "BLOCKED",
        reason:
          "Voice/video consultations stay blocked until contracted telehealth infrastructure and jurisdiction requirements are satisfied."
      });
    }
    if (!(new Date(endsAt) > new Date(startsAt))) {
      return send(res, 400, { ok: false, error: "invalid_time_range" });
    }

    const { data: provider, error: pErr } = await dbWrap.client
      .from("health_providers")
      .select("id,publication_status,license_status")
      .eq("id", providerId)
      .maybeSingle();
    if (pErr || !provider || provider.publication_status !== "published") {
      return send(res, 404, { ok: false, error: "provider_not_available" });
    }

    const { data, error } = await dbWrap.client
      .from("health_appointments")
      .insert({
        provider_id: providerId,
        patient_user_id: auth.user.id,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "requested",
        modality: modality === "message" ? "message" : "in_person",
        notes: String(body.notes || "").trim().slice(0, 1000) || null
      })
      .select("id,status,starts_at,ends_at,modality")
      .single();

    if (error) {
      if (/duplicate|unique/i.test(error.message || "")) {
        return send(res, 409, {
          ok: false,
          error: "slot_conflict",
          note: "Another appointment already occupies this provider slot."
        });
      }
      if (/relation .* does not exist/i.test(error.message || "")) {
        return send(res, 503, { ok: false, error: "health_appointments_migration_required" });
      }
      return send(res, 500, { ok: false, error: error.message });
    }

    return send(res, 200, {
      ok: true,
      action: "health_appointment_request",
      appointment: data,
      patient_platform_fee: "free",
      note: "Medical treatment costs are third-party and separate from HAVKAR platform fees."
    });
  }

  if (action === "health_subscribe_checkout") {
    return send(res, 403, {
      ok: false,
      error: "health_live_billing_off",
      live_billing_enabled: healthLiveBillingEnabled(process.env),
      charge_allowed_now: false,
      note:
        "Owner-approved proposed pricing is catalog-only. Live subscription charging stays OFF until final Owner approval of pricing and billing implementation."
    });
  }

  if (action === "health_telehealth_status") {
    const th = telehealthStatus(process.env);
    return send(res, 200, {
      ok: true,
      action: "health_telehealth_status",
      messaging: { status: "available", modality: "text_only" },
      voice: {
        status: th.voice,
        reason: th.blocker
      },
      video: {
        status: th.video,
        reason: th.blocker
      },
      public_clinical_sessions_allowed: th.public_clinical_sessions_allowed === true,
      authorized_test_sessions_allowed: th.authorized_test_sessions_allowed === true,
      readiness: th.readiness,
      features: th.features,
      ui: "/health-telehealth.html"
    });
  }

  if (action === "health_telehealth_session_create") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });

    const appointmentId = String(body.appointment_id || "").trim();
    const providerId = String(body.provider_id || "").trim();
    const modality = String(body.modality || "video").trim();
    if (!appointmentId || !providerId) {
      return send(res, 400, { ok: false, error: "appointment_and_provider_required" });
    }

    const { data: appt, error: aErr } = await dbWrap.client
      .from("health_appointments")
      .select("id,provider_id,patient_user_id,status,modality")
      .eq("id", appointmentId)
      .maybeSingle();
    if (aErr && /relation .* does not exist/i.test(aErr.message || "")) {
      return send(res, 503, { ok: false, error: "health_appointments_migration_required" });
    }
    if (!appt || appt.provider_id !== providerId) {
      return send(res, 404, { ok: false, error: "appointment_not_found" });
    }
    const owned = await ownProvider(dbWrap.client, auth.user.id, providerId);
    const isPatient = appt.patient_user_id === auth.user.id;
    if (!owned.ok && !isPatient) {
      return send(res, 403, { ok: false, error: "not_appointment_participant" });
    }

    const { data: provider } = await dbWrap.client
      .from("health_providers")
      .select("id,license_status,publication_status,country_code")
      .eq("id", providerId)
      .maybeSingle();
    if (!provider || provider.publication_status !== "published") {
      return send(res, 404, { ok: false, error: "provider_not_available" });
    }
    if (provider.license_status !== "verified") {
      return send(res, 403, {
        ok: false,
        error: "provider_license_not_verified",
        note: "Verified doctor/provider license required before telehealth sessions."
      });
    }

    const created = createTelehealthSession(
      {
        appointment_id: appointmentId,
        provider_id: providerId,
        patient_user_id: appt.patient_user_id,
        modality,
        consent_acknowledged: body.consent_acknowledged === true,
        actor_user_id: auth.user.id,
        jurisdiction: provider.country_code || null
      },
      process.env
    );
    if (!created.ok) {
      return send(res, created.error === "consent_required" ? 400 : 409, created);
    }

    // Persist session metadata only (no media / no clinical content).
    const { error: logErr } = await dbWrap.client.from("health_telehealth_sessions").insert({
      id: created.session.id,
      appointment_id: appointmentId,
      provider_id: providerId,
      patient_user_id: appt.patient_user_id,
      modality: created.session.modality,
      mode: created.session.mode,
      status: "waiting_room",
      recording: "OFF",
      created_by: auth.user.id
    });
    if (logErr && !/relation .* does not exist/i.test(logErr.message || "")) {
      return send(res, 500, { ok: false, error: logErr.message });
    }

    return send(res, 200, {
      ok: true,
      ...created,
      privacy: {
        media_recording_default: "OFF",
        session_log_excludes_media: true,
        gdpr_minimization: true
      }
    });
  }

  if (action === "health_telehealth_session_end") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });
    const sessionId = String(body.session_id || "").trim();
    const ended = endTelehealthSession(sessionId);
    if (!ended.ok) return send(res, 400, ended);
    await dbWrap.client
      .from("health_telehealth_sessions")
      .update({ status: "ended", ended_at: ended.ended_at, media_recorded: false })
      .eq("id", sessionId);
    return send(res, 200, ended);
  }

  if (action === "health_my_providers") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });
    const { data, error } = await dbWrap.client
      .from("health_providers")
      .select(
        "id,display_name,category_id,provider_kind,city,country_code,license_status,publication_status,subscription_required,regulated,updated_at"
      )
      .eq("user_id", auth.user.id)
      .order("updated_at", { ascending: false });
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return send(res, 200, { ok: true, providers: [], note: "migration_pending" });
      }
      return send(res, 500, { ok: false, error: error.message });
    }
    return send(res, 200, {
      ok: true,
      providers: data || [],
      billing: { live_billing_enabled: false, charge_allowed_now: false }
    });
  }

  if (action === "health_provider_update") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });
    const providerId = String(body.provider_id || body.id || "").trim();
    const owned = await ownProvider(dbWrap.client, auth.user.id, providerId);
    if (!owned.ok) return send(res, owned.error === "forbidden" ? 403 : 404, { ok: false, error: owned.error });

    const patch = {
      updated_at: new Date().toISOString()
    };
    ["bio", "website", "phone", "address", "city", "region", "accessibility_notes"].forEach((k) => {
      if (body[k] != null) patch[k] = String(body[k]).trim().slice(0, k === "bio" ? 4000 : 300);
    });
    if (body.country_code != null) {
      patch.country_code = String(body.country_code).trim().toUpperCase().slice(0, 2) || null;
    }
    if (typeof body.accepts_insurance === "boolean") patch.accepts_insurance = body.accepts_insurance;
    if (Array.isArray(body.languages)) {
      patch.languages = body.languages.map((s) => String(s).slice(0, 16)).slice(0, 20);
    }
    if (Array.isArray(body.specialties)) {
      patch.specialties = body.specialties.map((s) => String(s).slice(0, 80)).slice(0, 20);
    }
    if (body.latitude != null && Number.isFinite(Number(body.latitude))) {
      patch.latitude = Number(body.latitude);
    }
    if (body.longitude != null && Number.isFinite(Number(body.longitude))) {
      patch.longitude = Number(body.longitude);
    }
    if (body.self_reported_stats && typeof body.self_reported_stats === "object") {
      patch.self_reported_stats = {
        label: "self_reported_not_independently_verified",
        values: body.self_reported_stats
      };
    }
    // Providers cannot self-verify license or publish without review.
    if (body.request_publication === true) {
      patch.publication_status = "pending_review";
    }

    const { data, error } = await dbWrap.client
      .from("health_providers")
      .update(patch)
      .eq("id", providerId)
      .eq("user_id", auth.user.id)
      .select("id,publication_status,license_status,updated_at")
      .single();
    if (error) return send(res, 500, { ok: false, error: error.message });
    return send(res, 200, { ok: true, provider: data });
  }

  if (action === "health_license_submit") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });
    const providerId = String(body.provider_id || "").trim();
    const owned = await ownProvider(dbWrap.client, auth.user.id, providerId);
    if (!owned.ok) return send(res, owned.error === "forbidden" ? 403 : 404, { ok: false, error: owned.error });
    const licenseNumber = String(body.license_number || "").trim().slice(0, 120);
    const jurisdiction = String(body.license_jurisdiction || "").trim().slice(0, 120);
    if (!licenseNumber || !jurisdiction) {
      return send(res, 400, { ok: false, error: "license_number_and_jurisdiction_required" });
    }
    const licensePatch = {
      license_number: licenseNumber,
      license_jurisdiction: jurisdiction,
      license_status: "pending",
      verification_notes: String(body.notes || "").trim().slice(0, 1000) || null,
      updated_at: new Date().toISOString()
    };
    if (body.license_document_path != null) {
      licensePatch.license_document_path = String(body.license_document_path)
        .trim()
        .slice(0, 500) || null;
    }
    const { data, error } = await dbWrap.client
      .from("health_providers")
      .update(licensePatch)
      .eq("id", providerId)
      .select("id,license_status,license_jurisdiction,license_document_path")
      .single();
    if (error) return send(res, 500, { ok: false, error: error.message });
    await dbWrap.client.from("health_license_audits").insert({
      provider_id: providerId,
      actor_user_id: auth.user.id,
      action: "license_submit",
      from_status: owned.provider.license_status,
      to_status: "pending",
      notes: "Provider submitted license for jurisdiction verification."
    });
    return send(res, 200, {
      ok: true,
      provider: data,
      note: "License marked pending. Manual jurisdiction verification required before verified label."
    });
  }

  if (action === "health_owner_queue") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });
    if (!isOwnerIdentity(auth.user)) {
      return send(res, 403, { ok: false, error: "owner_only" });
    }
    const { data, error } = await dbWrap.client
      .from("health_providers")
      .select(
        "id,display_name,category_id,provider_kind,city,country_code,region,license_number,license_jurisdiction,license_status,publication_status,verification_notes,license_document_path,updated_at,created_at"
      )
      .or("license_status.eq.pending,publication_status.eq.pending_review")
      .order("updated_at", { ascending: true })
      .limit(200);
    if (error) {
      if (/license_document_path|column .* does not exist/i.test(error.message || "")) {
        const retry = await dbWrap.client
          .from("health_providers")
          .select(
            "id,display_name,category_id,provider_kind,city,country_code,region,license_number,license_jurisdiction,license_status,publication_status,verification_notes,updated_at,created_at"
          )
          .or("license_status.eq.pending,publication_status.eq.pending_review")
          .order("updated_at", { ascending: true })
          .limit(200);
        if (retry.error) {
          if (/relation .* does not exist/i.test(retry.error.message || "")) {
            return send(res, 200, { ok: true, providers: [], note: "migration_pending" });
          }
          return send(res, 500, { ok: false, error: retry.error.message });
        }
        return send(res, 200, { ok: true, providers: retry.data || [] });
      }
      if (/relation .* does not exist/i.test(error.message || "")) {
        return send(res, 200, { ok: true, providers: [], note: "migration_pending" });
      }
      return send(res, 500, { ok: false, error: error.message });
    }
    return send(res, 200, { ok: true, providers: data || [] });
  }

  if (action === "health_owner_verify_license") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });
    if (!isOwnerIdentity(auth.user)) {
      return send(res, 403, { ok: false, error: "owner_only" });
    }
    const providerId = String(body.provider_id || "").trim();
    const toStatus = String(body.to_status || "").trim();
    if (["verified", "rejected", "suspended", "pending"].indexOf(toStatus) === -1) {
      return send(res, 400, { ok: false, error: "invalid_to_status" });
    }
    const { data: existing } = await dbWrap.client
      .from("health_providers")
      .select("id,license_status,publication_status")
      .eq("id", providerId)
      .maybeSingle();
    if (!existing) return send(res, 404, { ok: false, error: "provider_not_found" });
    const patch = {
      license_status: toStatus,
      verification_notes: String(body.notes || "").trim().slice(0, 1000) || null,
      updated_at: new Date().toISOString()
    };
    if (toStatus === "verified" && body.publish === true) {
      patch.publication_status = "published";
    }
    if (toStatus === "rejected" || toStatus === "suspended") {
      patch.publication_status = "suspended";
    }
    const { data, error } = await dbWrap.client
      .from("health_providers")
      .update(patch)
      .eq("id", providerId)
      .select("id,license_status,publication_status")
      .single();
    if (error) return send(res, 500, { ok: false, error: error.message });
    await dbWrap.client.from("health_license_audits").insert({
      provider_id: providerId,
      actor_user_id: auth.user.id,
      action: "owner_verify",
      from_status: existing.license_status,
      to_status: toStatus,
      notes: String(body.notes || "").trim().slice(0, 1000) || null
    });
    return send(res, 200, { ok: true, provider: data });
  }

  if (action === "health_availability_set") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });
    const providerId = String(body.provider_id || "").trim();
    const owned = await ownProvider(dbWrap.client, auth.user.id, providerId);
    if (!owned.ok) return send(res, owned.error === "forbidden" ? 403 : 404, { ok: false, error: owned.error });
    const startsAt = String(body.starts_at || "").trim();
    const endsAt = String(body.ends_at || "").trim();
    const modality = String(body.modality || "in_person").trim();
    if (!startsAt || !endsAt || !(new Date(endsAt) > new Date(startsAt))) {
      return send(res, 400, { ok: false, error: "invalid_time_range" });
    }
    if (modality !== "in_person" && modality !== "message") {
      return send(res, 409, {
        ok: false,
        error: "telehealth_blocked",
        status: "BLOCKED",
        reason: "Only in_person and message slots can be opened until telehealth is contracted."
      });
    }
    const { data, error } = await dbWrap.client
      .from("health_availability_slots")
      .upsert(
        {
          provider_id: providerId,
          starts_at: startsAt,
          ends_at: endsAt,
          modality,
          is_open: body.is_open === false ? false : true
        },
        { onConflict: "provider_id,starts_at" }
      )
      .select("id,provider_id,starts_at,ends_at,modality,is_open")
      .single();
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return send(res, 503, { ok: false, error: "availability_migration_required" });
      }
      return send(res, 500, { ok: false, error: error.message });
    }
    return send(res, 200, { ok: true, slot: data });
  }

  if (action === "health_availability_list") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const providerId = String(body.provider_id || (req.query && req.query.provider_id) || "").trim();
    if (!providerId) return send(res, 400, { ok: false, error: "provider_id_required" });
    const { data, error } = await dbWrap.client
      .from("health_availability_slots")
      .select("id,provider_id,starts_at,ends_at,modality,is_open")
      .eq("provider_id", providerId)
      .eq("is_open", true)
      .gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(100);
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return send(res, 200, { ok: true, slots: [], note: "migration_pending" });
      }
      return send(res, 500, { ok: false, error: error.message });
    }
    return send(res, 200, { ok: true, slots: data || [], patients_platform_fee: "free" });
  }

  if (action === "health_appointment_update") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });
    const appointmentId = String(body.appointment_id || "").trim();
    const toStatus = String(body.status || "").trim();
    if (["confirmed", "cancelled", "completed", "no_show"].indexOf(toStatus) === -1) {
      return send(res, 400, { ok: false, error: "invalid_status" });
    }
    const { data: appt, error: aErr } = await dbWrap.client
      .from("health_appointments")
      .select("id,provider_id,patient_user_id,status,modality")
      .eq("id", appointmentId)
      .maybeSingle();
    if (aErr || !appt) return send(res, 404, { ok: false, error: "appointment_not_found" });
    const owned = await ownProvider(dbWrap.client, auth.user.id, appt.provider_id);
    const isPatient = appt.patient_user_id === auth.user.id;
    if (!owned.ok && !isPatient) return send(res, 403, { ok: false, error: "forbidden" });
    if (isPatient && !owned.ok && toStatus !== "cancelled") {
      return send(res, 403, { ok: false, error: "patients_may_only_cancel" });
    }
    if (["voice", "video"].indexOf(appt.modality) !== -1) {
      return send(res, 409, { ok: false, error: "telehealth_blocked", status: "BLOCKED" });
    }
    const { data, error } = await dbWrap.client
      .from("health_appointments")
      .update({ status: toStatus, updated_at: new Date().toISOString() })
      .eq("id", appointmentId)
      .select("id,status,starts_at,ends_at,modality")
      .single();
    if (error) return send(res, 500, { ok: false, error: error.message });
    return send(res, 200, { ok: true, appointment: data, patient_platform_fee: "free" });
  }

  if (action === "health_appointments_list") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });
    const providerId = String(body.provider_id || "").trim();
    let q = dbWrap.client
      .from("health_appointments")
      .select("id,provider_id,patient_user_id,starts_at,ends_at,status,modality,created_at")
      .order("starts_at", { ascending: true })
      .limit(100);
    if (providerId) {
      const owned = await ownProvider(dbWrap.client, auth.user.id, providerId);
      if (!owned.ok) return send(res, 403, { ok: false, error: "forbidden" });
      q = q.eq("provider_id", providerId);
    } else {
      q = q.eq("patient_user_id", auth.user.id);
    }
    const { data, error } = await q;
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return send(res, 200, { ok: true, appointments: [] });
      }
      return send(res, 500, { ok: false, error: error.message });
    }
    return send(res, 200, { ok: true, appointments: data || [], patient_platform_fee: "free" });
  }

  if (action === "health_message_send") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });
    if (body.consent_acknowledged !== true) {
      return send(res, 400, {
        ok: false,
        error: "consent_required",
        note: "Explicit consent is required before health messaging. Minimize health details."
      });
    }
    const providerId = String(body.provider_id || "").trim();
    const text = String(body.body || "").trim().slice(0, 2000);
    if (!providerId || !text) return send(res, 400, { ok: false, error: "provider_and_body_required" });
    const { data: provider } = await dbWrap.client
      .from("health_providers")
      .select("id,user_id,publication_status")
      .eq("id", providerId)
      .maybeSingle();
    if (!provider || provider.publication_status !== "published") {
      return send(res, 404, { ok: false, error: "provider_not_available" });
    }
    let patientUserId = String(body.patient_user_id || "").trim();
    if (provider.user_id === auth.user.id) {
      if (!patientUserId) return send(res, 400, { ok: false, error: "patient_user_id_required" });
    } else {
      patientUserId = auth.user.id;
    }
    const { data, error } = await dbWrap.client
      .from("health_messages")
      .insert({
        provider_id: providerId,
        patient_user_id: patientUserId,
        sender_user_id: auth.user.id,
        body: text,
        consent_acknowledged: true
      })
      .select("id,created_at,provider_id,patient_user_id,sender_user_id")
      .single();
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return send(res, 503, { ok: false, error: "messages_migration_required" });
      }
      return send(res, 500, { ok: false, error: error.message });
    }
    return send(res, 200, {
      ok: true,
      message: data,
      patients_platform_fee: "free",
      telehealth: { voice: "BLOCKED", video: "BLOCKED" }
    });
  }

  if (action === "health_message_list") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });
    const providerId = String(body.provider_id || "").trim();
    if (!providerId) return send(res, 400, { ok: false, error: "provider_id_required" });
    const owned = await ownProvider(dbWrap.client, auth.user.id, providerId);
    let patientUserId = String(body.patient_user_id || "").trim();
    if (owned.ok) {
      if (!patientUserId) return send(res, 400, { ok: false, error: "patient_user_id_required" });
    } else {
      patientUserId = auth.user.id;
    }
    const { data, error } = await dbWrap.client
      .from("health_messages")
      .select("id,body,sender_user_id,patient_user_id,created_at,consent_acknowledged")
      .eq("provider_id", providerId)
      .eq("patient_user_id", patientUserId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return send(res, 200, { ok: true, messages: [] });
      }
      return send(res, 500, { ok: false, error: error.message });
    }
    return send(res, 200, { ok: true, messages: data || [], patients_platform_fee: "free" });
  }

  if (action === "health_review_create") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });
    const providerId = String(body.provider_id || "").trim();
    const rating = Number(body.rating);
    if (!providerId || !Number.isFinite(rating) || rating < 1 || rating > 5) {
      return send(res, 400, { ok: false, error: "provider_and_rating_required" });
    }
    let verifiedVisit = false;
    let appointmentId = String(body.appointment_id || "").trim() || null;
    if (appointmentId) {
      const { data: appt } = await dbWrap.client
        .from("health_appointments")
        .select("id,patient_user_id,provider_id,status")
        .eq("id", appointmentId)
        .maybeSingle();
      if (
        appt &&
        appt.patient_user_id === auth.user.id &&
        appt.provider_id === providerId &&
        (appt.status === "completed" || appt.status === "confirmed")
      ) {
        verifiedVisit = true;
      } else {
        appointmentId = null;
      }
    }
    const { data, error } = await dbWrap.client
      .from("health_reviews")
      .insert({
        provider_id: providerId,
        patient_user_id: auth.user.id,
        appointment_id: appointmentId,
        rating: Math.round(rating),
        review_text: String(body.review_text || "").trim().slice(0, 2000) || null,
        verified_visit: verifiedVisit,
        publication_status: "published"
      })
      .select("id,rating,verified_visit,created_at")
      .single();
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return send(res, 503, { ok: false, error: "health_reviews_migration_required" });
      }
      return send(res, 500, { ok: false, error: error.message });
    }
    return send(res, 200, {
      ok: true,
      review: data,
      note: "Legacy public.reviews rows are preserved separately and were not modified."
    });
  }

  if (action === "health_review_reply") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const auth = await authenticateBearer(req, dbWrap.client);
    if (!auth.ok) return send(res, auth.httpStatus || 401, { ok: false, error: auth.error });
    const reviewId = String(body.review_id || "").trim();
    const reply = String(body.provider_reply || "").trim().slice(0, 2000);
    if (!reviewId || !reply) return send(res, 400, { ok: false, error: "review_and_reply_required" });
    const { data: review } = await dbWrap.client
      .from("health_reviews")
      .select("id,provider_id")
      .eq("id", reviewId)
      .maybeSingle();
    if (!review) return send(res, 404, { ok: false, error: "review_not_found" });
    const owned = await ownProvider(dbWrap.client, auth.user.id, review.provider_id);
    if (!owned.ok) return send(res, 403, { ok: false, error: "forbidden" });
    const { data, error } = await dbWrap.client
      .from("health_reviews")
      .update({
        provider_reply: reply,
        provider_replied_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", reviewId)
      .select("id,provider_reply,provider_replied_at")
      .single();
    if (error) return send(res, 500, { ok: false, error: error.message });
    return send(res, 200, { ok: true, review: data });
  }

  if (action === "health_reviews_list") {
    const dbWrap = getAdminClient();
    if (!dbWrap.ok) return send(res, 503, { ok: false, error: dbWrap.error });
    const providerId = String(body.provider_id || (req.query && req.query.provider_id) || "").trim();
    if (!providerId) return send(res, 400, { ok: false, error: "provider_id_required" });
    const { data, error } = await dbWrap.client
      .from("health_reviews")
      .select("id,rating,review_text,verified_visit,provider_reply,provider_replied_at,created_at")
      .eq("provider_id", providerId)
      .eq("publication_status", "published")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return send(res, 200, { ok: true, reviews: [] });
      }
      return send(res, 500, { ok: false, error: error.message });
    }
    return send(res, 200, { ok: true, reviews: data || [] });
  }

  if (action === "health_rankings") {
    const dbWrap = getAdminClient();
    const methodology = rankingMethodology();
    if (!dbWrap.ok) {
      return send(res, 200, {
        ok: true,
        action: "health_rankings",
        level: String(body.level || "global"),
        results: [],
        methodology,
        note: "No invented rankings. Publish verified providers and reviews first."
      });
    }
    const level = String(body.level || "global").trim();
    const categoryId = String(body.category_id || "").trim() || null;
    const country = String(body.country_code || "").trim().toUpperCase().slice(0, 2) || null;
    const city = String(body.city || "").trim() || null;
    const region = String(body.region || "").trim() || null;
    let pq = dbWrap.client
      .from("health_providers")
      .select("id,display_name,category_id,city,region,country_code,license_status,regulated")
      .eq("publication_status", "published")
      .limit(200);
    if (categoryId) pq = pq.eq("category_id", categoryId);
    if (country) pq = pq.eq("country_code", country);
    if (city) pq = pq.ilike("city", "%" + city + "%");
    if (region) pq = pq.ilike("region", "%" + region + "%");
    const { data: providers, error } = await pq;
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return send(res, 200, { ok: true, results: [], methodology, note: "migration_pending" });
      }
      return send(res, 500, { ok: false, error: error.message });
    }
    const rows = providers || [];
    if (!rows.length) {
      return send(res, 200, {
        ok: true,
        level,
        results: [],
        methodology,
        note: "Empty ranking — no published providers in this scope."
      });
    }
    const ids = rows.map((r) => r.id);
    const { data: reviews } = await dbWrap.client
      .from("health_reviews")
      .select("provider_id,rating,verified_visit")
      .in("provider_id", ids)
      .eq("publication_status", "published");
    const agg = {};
    (reviews || []).forEach((rv) => {
      if (!agg[rv.provider_id]) agg[rv.provider_id] = { sum: 0, n: 0, verified: 0 };
      agg[rv.provider_id].sum += Number(rv.rating) || 0;
      agg[rv.provider_id].n += 1;
      if (rv.verified_visit) agg[rv.provider_id].verified += 1;
    });
    const ranked = rows
      .map((p) => {
        const a = agg[p.id] || { sum: 0, n: 0, verified: 0 };
        const avg_rating = a.n ? a.sum / a.n : 0;
        const review_count = a.n;
        const score = rankingScore({
          avg_rating,
          review_count,
          license_status: p.license_status
        });
        return {
          provider_id: p.id,
          display_name: p.display_name,
          category_id: p.category_id,
          city: p.city,
          region: p.region,
          country_code: p.country_code,
          license_status: p.license_status,
          avg_rating: Number(avg_rating.toFixed(2)),
          review_count,
          verified_visit_reviews: a.verified,
          score,
          purchased_rank_boost: false
        };
      })
      .sort((a, b) => b.score - a.score || b.review_count - a.review_count);
    return send(res, 200, {
      ok: true,
      action: "health_rankings",
      level,
      within_category_only: Boolean(categoryId),
      results: ranked,
      methodology,
      note: "Subscription payments cannot purchase better clinical rankings."
    });
  }

  return send(res, 400, { ok: false, error: "unknown_health_action", action });
}

module.exports = { handler, MEDICINE_ENTRIES, rankingScore };

