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

async function searchProviders(db, filters) {
  let q = db
    .from("health_providers")
    .select(
      "id,display_name,category_id,provider_kind,specialties,languages,country_code,region,city,address,latitude,longitude,license_status,regulated,accepts_insurance,accessibility_notes,publication_status"
    )
    .eq("publication_status", "published")
    .limit(100);

  if (filters.category_id) q = q.eq("category_id", filters.category_id);
  if (filters.country_code) q = q.eq("country_code", filters.country_code);
  if (filters.city) q = q.ilike("city", "%" + filters.city + "%");
  if (filters.verified_only) q = q.eq("license_status", "verified");
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
  return { ok: true, results: rows };
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
      country_code: String(body.country_code || "")
        .trim()
        .toUpperCase()
        .slice(0, 2) || null,
      category_id: String(body.category_id || "").trim() || null,
      language: String(body.language || "").trim() || null,
      verified_only: Boolean(body.verified_only),
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

  return send(res, 400, { ok: false, error: "unknown_health_action", action });
}

module.exports = { handler, MEDICINE_ENTRIES };
