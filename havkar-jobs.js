/*
 * HAVKAR jobs rules.
 *
 * Uses only columns that already exist on public.jobs.
 * Update and delete stay limited to the signed-in owner.
 * This file never marks a listing active and never confirms payment.
 */
(function (root, factory) {

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.HAVKAR_JOBS = api;

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  const JOB_COLUMNS = "id,created_at,user_id,title,company,location,job_type,salary,description,requirements,contact,status,expires_at,application_url,remote,category,language,experience_level,education_level,skills,currency,salary_min,salary_max,type,image,plan,monthly_fee,employer_kind,company_id";

  const JOB_TYPES = [
    "Full-time",
    "Part-time",
    "Remote",
    "Freelance",
    "Contract"
  ];

  /* Ordinary employer: approved one-time 30-day prepaid fees (not invented). */
  const PLANS = {
    Basic: 9.99,
    Professional: 19.99,
    Business: 39.99
  };

  /* Verified company: approved monthly Stripe subscriptions with auto-renew. */
  const CORPORATE_PLANS = {
    business: {
      id: "business",
      label: "Business",
      eur: 49.99,
      cents: 4999,
      interval: "month",
      activeAdvertisementLimit: 10,
      autoRenew: true
    },
    business_plus: {
      id: "business_plus",
      label: "Business Plus",
      eur: 99.99,
      cents: 9999,
      interval: "month",
      activeAdvertisementLimit: 30,
      autoRenew: true
    },
    enterprise: {
      id: "enterprise",
      label: "Enterprise",
      eur: 199.99,
      cents: 19999,
      interval: "month",
      activeAdvertisementLimit: 100,
      autoRenew: true
    }
  };

  const APPLICATION_COLUMNS =
    "id,job_id,applicant_id,cover_letter,resume_path,status,conversation_id,employer_notes,interview_at,applicant_consent_at,withdrawn_at,created_at,updated_at";

  const BLOCKED_UPDATE_FIELDS = [
    "status",
    "plan",
    "monthly_fee",
    "user_id",
    "id",
    "created_at",
    "employer_kind",
    "company_id"
  ];

  const MESSAGES = {
    required_fields: "Please complete all required fields.",
    title_short: "Please enter a valid job title.",
    company_short: "Please enter a valid company name.",
    description_short: "Please provide a more detailed job description.",
    invalid_type: "Please choose a job type.",
    invalid_application_url: "Enter a full http or https application link, or leave it empty.",
    invalid_plan: "Please choose a publishing plan.",
    invalid_image: "Please select a valid image file.",
    missing: "Please sign in before continuing.",
    rejected: "The server rejected this change.",
    not_confirmed: "The server did not confirm this change.",
    blocked_fields: "This change is not available.",
    payment_required: "The job stays inactive until a real payment provider confirms it.",
    company_not_verified: "Corporate subscriptions and company listings require a verified company. Verification is set by HAVKAR staff only.",
    corporate_payments_off: "Corporate subscription checkout stays disabled while Jobs payments are off. No charge was created.",
    application_inactive: "This listing is not open for applications.",
    application_self: "You cannot apply to your own job listing.",
    application_short: "Add a short cover note before applying."
  };

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function isExpired(job, now) {
    if (!job || !job.expires_at) return false;
    const time = Date.parse(job.expires_at);
    if (Number.isNaN(time)) return false;
    const clock = typeof now === "number" ? now : Date.now();
    return time <= clock;
  }

  function isPublicListing(job, now) {
    return Boolean(job) && job.status === "active" && !isExpired(job, now);
  }

  function isListedJob(job, now) {
    if (!job) return false;
    if (job.owner === true) return true;
    return isPublicListing(job, now);
  }

  function jobStatusKind(job, now) {
    if (!job) return "inactive";
    if (job.status === "active" && isExpired(job, now)) return "expired";
    if (job.status === "active") return "active";
    if (job.status === "pending_payment") return "pending_payment";
    return "inactive";
  }

  function jobMatchesType(job, filter) {
    const wanted = clean(filter);
    if (!wanted || wanted === "All") return true;
    const type = clean(job && (job.job_type || job.type)).toLowerCase();
    if (wanted.toLowerCase() === "remote") {
      return job.remote === true || type === "remote";
    }
    return type === wanted.toLowerCase();
  }

  function jobSearchHaystack(job) {
    const skills = Array.isArray(job && job.skills)
      ? job.skills.join(" ")
      : (job && job.skills) || "";
    return [
      job && job.title,
      job && job.company,
      job && job.location,
      job && job.type,
      job && job.job_type,
      skills,
      job && job.description,
      job && job.requirements,
      job && job.category,
      job && job.language,
      job && job.experience_level,
      job && job.education_level
    ].map(function (value) {
      return String(value == null ? "" : value);
    }).join(" ").toLowerCase();
  }

  function filterJobs(list, options) {
    const settings = options || {};
    const query = clean(settings.query).toLowerCase();
    const location = clean(settings.location).toLowerCase();
    return (list || []).filter(function (job) {
      if (!jobMatchesType(job, settings.filter)) return false;
      if (location && !String(job.location || "").toLowerCase().includes(location)) {
        return false;
      }
      if (query && !jobSearchHaystack(job).includes(query)) return false;
      return true;
    });
  }

  function normalizeApplicationUrl(value) {
    const raw = clean(value);
    if (!raw) return { ok: true, url: null };
    if (raw.length > 500 || /[\u0000-\u001F\u007F]/.test(raw)) {
      return { ok: false, reason: "invalid_application_url" };
    }
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (error) {
      return { ok: false, reason: "invalid_application_url" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, reason: "invalid_application_url" };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, reason: "invalid_application_url" };
    }
    return { ok: true, url: parsed.href };
  }

  function isEmail(value) {
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);
  }

  function normalizePhone(value) {
    const compact = String(value || "").replace(/[\s().-]/g, "");
    if (!/^\+?[0-9]{7,15}$/.test(compact)) return null;
    return compact;
  }

  function contactAction(job, now) {
    if (!isPublicListing(job, now)) {
      return {
        available: false,
        reason: "inactive",
        label: "This listing is not open for applications."
      };
    }

    const urlResult = normalizeApplicationUrl(job.application_url);
    if (urlResult.ok && urlResult.url) {
      return {
        available: true,
        kind: "url",
        href: urlResult.url,
        label: "Apply on the employer site"
      };
    }

    const contact = clean(job.contact);
    if (isEmail(contact)) {
      return {
        available: true,
        kind: "email",
        href: "mailto:" + contact,
        label: "Email the employer",
        text: contact
      };
    }

    const phone = normalizePhone(contact);
    if (phone) {
      return {
        available: true,
        kind: "phone",
        href: "tel:" + phone,
        label: "Call the employer",
        text: contact
      };
    }

    if (contact) {
      return {
        available: true,
        kind: "text",
        label: "Employer contact",
        text: contact
      };
    }

    return {
      available: false,
      reason: "missing",
      label: "Application contact is not available."
    };
  }

  function skillsText(value) {
    if (Array.isArray(value)) {
      return value.map(clean).filter(Boolean).join(", ");
    }
    return clean(value);
  }

  function allowedType(type, existingType) {
    if (JOB_TYPES.indexOf(type) !== -1) return true;
    const current = clean(existingType);
    return Boolean(current) && type === current && current.length <= 40 && !/[\r\n<>]/.test(current);
  }

  function normalizeImage(value) {
    if (value == null || value === "") return { ok: true, image: null };
    const text = String(value);
    if (!text.startsWith("data:image/jpeg") || text.length > 2000000) {
      return { ok: false, reason: "invalid_image" };
    }
    return { ok: true, image: text };
  }

  function validateJobDraft(draft, options) {
    const source = draft || {};
    const mode = options && options.mode;
    const title = clean(source.title);
    const company = clean(source.company);
    const type = clean(source.type || source.job_type);
    let location = clean(source.location);
    if (!location && type === "Remote") {
      location = "Remote";
    }
    const description = clean(source.description);
    const salary = clean(source.salary);
    const skills = skillsText(source.skills);
    const requirements = clean(source.requirements);
    const contact = clean(source.contact);

    if (!title || !company || !location || !description) {
      return { ok: false, reason: "required_fields", message: MESSAGES.required_fields };
    }
    if (title.length < 2 || title.length > 120) {
      return { ok: false, reason: "title_short", message: MESSAGES.title_short };
    }
    if (company.length < 2 || company.length > 120) {
      return { ok: false, reason: "company_short", message: MESSAGES.company_short };
    }
    if (location.length > 120) {
      return { ok: false, reason: "required_fields", message: MESSAGES.required_fields };
    }
    if (description.length < 10 || description.length > 3000) {
      return { ok: false, reason: "description_short", message: MESSAGES.description_short };
    }
    if (!allowedType(type, mode === "edit" ? source.existingType : "")) {
      return { ok: false, reason: "invalid_type", message: MESSAGES.invalid_type };
    }
    if (salary.length > 100 || skills.length > 250 || requirements.length > 3000 || contact.length > 200) {
      return { ok: false, reason: "required_fields", message: MESSAGES.required_fields };
    }

    const urlResult = normalizeApplicationUrl(source.application_url);
    if (!urlResult.ok) {
      return { ok: false, reason: urlResult.reason, message: MESSAGES.invalid_application_url };
    }

    const value = {
      title: title,
      company: company,
      location: location,
      type: type,
      salary: salary,
      skills: skills,
      description: description,
      requirements: requirements,
      contact: contact,
      application_url: urlResult.url
    };

    if (Object.prototype.hasOwnProperty.call(source, "image")) {
      const image = normalizeImage(source.image);
      if (!image.ok) {
        return { ok: false, reason: image.reason, message: MESSAGES.invalid_image };
      }
      value.image = image.image;
    }

    return { ok: true, value: value };
  }

  function contentPayload(value) {
    return {
      title: value.title,
      company: value.company,
      location: value.location,
      job_type: value.type,
      type: value.type,
      salary: value.salary || "Negotiable",
      skills: value.skills || "General",
      description: value.description,
      requirements: value.requirements || null,
      contact: value.contact || null,
      application_url: value.application_url,
      remote: value.type === "Remote"
    };
  }

  function payloadIsSafe(payload) {
    return BLOCKED_UPDATE_FIELDS.every(function (field) {
      return !Object.prototype.hasOwnProperty.call(payload, field);
    });
  }

  function buildJobUpdate(draft) {
    const validation = validateJobDraft(draft, { mode: "edit" });
    if (!validation.ok) return validation;
    const payload = contentPayload(validation.value);
    if (Object.prototype.hasOwnProperty.call(validation.value, "image")) {
      payload.image = validation.value.image;
    }
    BLOCKED_UPDATE_FIELDS.forEach(function (field) {
      delete payload[field];
    });
    return { ok: true, payload: payload };
  }

  function normalizePlan(plan) {
    const name = plan && plan.name;
    if (!Object.prototype.hasOwnProperty.call(PLANS, name)) return null;
    const price = Number(plan.price);
    if (price !== PLANS[name]) return null;
    return { name: name, price: price, billing: "one_time_prepaid", periodDays: 30 };
  }

  function normalizeCorporatePlan(planCode) {
    const code = clean(planCode).toLowerCase().replace(/[\s-]+/g, "_");
    return CORPORATE_PLANS[code] || null;
  }

  function normalizeCurrencyCode(value) {
    const raw = clean(value).toUpperCase();
    if (!raw) return "EUR";
    if (raw === "XLM" || raw === "STELLAR" || raw === "✦") return "XLM";
    if (!/^[A-Z]{3}$/.test(raw)) return null;
    return raw;
  }

  function formatCurrencyLabel(code, currencyMeta) {
    const normalized = normalizeCurrencyCode(code) || "EUR";
    if (normalized === "XLM") {
      return "XLM — Stellar Lumens (crypto, not a Stripe fiat currency)";
    }
    const meta = currencyMeta && (
      currencyMeta[normalized] ||
      currencyMeta[normalized.toLowerCase()] ||
      (Array.isArray(currencyMeta)
        ? currencyMeta.find(function (row) {
          return String(row.code || "").toUpperCase() === normalized;
        })
        : null)
    );
    const name = meta && (meta.name || meta.currency_name);
    if (name) return normalized + " — " + name;
    return normalized;
  }

  function companyIsVerified(company) {
    return Boolean(company) && company.verification_status === "verified";
  }

  function companyMayUseCorporate(company) {
    if (!companyIsVerified(company)) {
      return {
        ok: false,
        reason: "company_not_verified",
        message: MESSAGES.company_not_verified
      };
    }
    return { ok: true };
  }

  function buildCorporateSubscriptionQuote(company, planCode, paymentsLive) {
    const gate = companyMayUseCorporate(company);
    if (!gate.ok) return gate;
    const plan = normalizeCorporatePlan(planCode);
    if (!plan) {
      return { ok: false, reason: "invalid_plan", message: MESSAGES.invalid_plan };
    }
    return {
      ok: true,
      plan: plan,
      billing: "stripe_subscription_monthly",
      auto_renew: true,
      xlm_supported: false,
      charge_allowed_now: paymentsLive === true,
      charge_created: false,
      message: paymentsLive === true
        ? "Corporate subscription is Owner-armed. Start Checkout only after company verification."
        : MESSAGES.corporate_payments_off
    };
  }

  function buildApplicationInsert(input) {
    const source = input || {};
    const job = source.job;
    const applicantId = source.applicantId;
    const cover = clean(source.cover_letter || source.coverLetter);
    if (!job || !applicantId) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    if (!isPublicListing(job, source.now)) {
      return { ok: false, reason: "application_inactive", message: MESSAGES.application_inactive };
    }
    if (String(job.user_id || "") === String(applicantId)) {
      return { ok: false, reason: "application_self", message: MESSAGES.application_self };
    }
    if (cover.length < 8 || cover.length > 4000) {
      return { ok: false, reason: "application_short", message: MESSAGES.application_short };
    }
    return {
      ok: true,
      payload: {
        job_id: job.id,
        applicant_id: applicantId,
        cover_letter: cover,
        status: "submitted",
        applicant_consent_at: new Date().toISOString()
      }
    };
  }

  function buildJobInsert(draft, userId, plan) {
    const validation = validateJobDraft(draft, { mode: "create" });
    if (!validation.ok) return validation;
    const chosen = normalizePlan(plan);
    if (!chosen || !userId) {
      return { ok: false, reason: "invalid_plan", message: MESSAGES.invalid_plan };
    }
    const image = normalizeImage(
      Object.prototype.hasOwnProperty.call(draft || {}, "image") ? draft.image : null
    );
    if (!image.ok) {
      return { ok: false, reason: image.reason, message: MESSAGES.invalid_image };
    }
    const currency = normalizeCurrencyCode((draft && draft.currency) || "EUR");
    if (!currency) {
      return { ok: false, reason: "required_fields", message: MESSAGES.required_fields };
    }
    const employerKind = clean((draft && draft.employer_kind) || "ordinary") || "ordinary";
    if (employerKind !== "ordinary" && employerKind !== "company") {
      return { ok: false, reason: "required_fields", message: MESSAGES.required_fields };
    }
    if (employerKind === "company") {
      const gate = companyMayUseCorporate(draft && draft.company_record);
      if (!gate.ok) return gate;
      if (!(draft && draft.company_id)) {
        return { ok: false, reason: "company_not_verified", message: MESSAGES.company_not_verified };
      }
    }
    const payload = contentPayload(validation.value);
    payload.user_id = userId;
    payload.image = image.image;
    payload.status = "pending_payment";
    payload.plan = chosen.name;
    payload.monthly_fee = chosen.price;
    payload.currency = currency;
    payload.employer_kind = employerKind;
    if (employerKind === "company" && draft && draft.company_id) {
      payload.company_id = draft.company_id;
    }
    if (payload.status !== "pending_payment") {
      return { ok: false, reason: "payment_required", message: MESSAGES.payment_required };
    }
    return { ok: true, payload: payload };
  }

  function oneRow(data) {
    if (Array.isArray(data)) {
      return data.length === 1 ? data[0] : null;
    }
    if (data && typeof data === "object" && data.id != null) return data;
    return null;
  }

  function confirmed(result) {
    if (!result || result.error) {
      return {
        ok: false,
        reason: "rejected",
        message: (result && result.error && result.error.message) || MESSAGES.rejected
      };
    }
    const row = oneRow(result.data);
    if (!row) {
      return { ok: false, reason: "not_confirmed", message: MESSAGES.not_confirmed };
    }
    return { ok: true, row: row };
  }

  async function createOwnJob(client, input) {
    const source = input || {};
    const built = buildJobInsert(source.draft, source.userId, source.plan);
    if (!built.ok) return built;
    if (built.payload.status !== "pending_payment") {
      return { ok: false, reason: "payment_required", message: MESSAGES.payment_required };
    }
    const result = await client
      .from("jobs")
      .insert(built.payload)
      .select(JOB_COLUMNS)
      .single();
    return confirmed(result);
  }

  async function updateOwnJob(client, input) {
    const source = input || {};
    if (!client || !source.jobId || !source.userId) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    const built = buildJobUpdate(source.draft);
    if (!built.ok) return built;
    if (!payloadIsSafe(built.payload)) {
      return { ok: false, reason: "blocked_fields", message: MESSAGES.blocked_fields };
    }
    const result = await client
      .from("jobs")
      .update(built.payload)
      .eq("id", source.jobId)
      .eq("user_id", source.userId)
      .select(JOB_COLUMNS);
    return confirmed(result);
  }

  async function deleteOwnJob(client, input) {
    const source = input || {};
    if (!client || !source.jobId || !source.userId) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    const result = await client
      .from("jobs")
      .delete()
      .eq("id", source.jobId)
      .eq("user_id", source.userId)
      .select("id");
    return confirmed(result);
  }

  async function submitJobApplication(client, input) {
    const built = buildApplicationInsert(input);
    if (!built.ok) return built;
    if (!client) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    const result = await client
      .from("job_applications")
      .insert(built.payload)
      .select(APPLICATION_COLUMNS)
      .single();
    return confirmed(result);
  }

  async function listApplicationsForJob(client, input) {
    const source = input || {};
    if (!client || !source.jobId || !source.userId) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    const owned = await client
      .from("jobs")
      .select("id,user_id")
      .eq("id", source.jobId)
      .eq("user_id", source.userId)
      .maybeSingle();
    if (owned.error || !owned.data) {
      return { ok: false, reason: "rejected", message: MESSAGES.rejected };
    }
    const result = await client
      .from("job_applications")
      .select(APPLICATION_COLUMNS)
      .eq("job_id", source.jobId)
      .order("created_at", { ascending: false });
    if (result.error) {
      return { ok: false, reason: "rejected", message: result.error.message || MESSAGES.rejected };
    }
    return { ok: true, rows: result.data || [] };
  }

  async function loadOwnCompanies(client, userId) {
    if (!client || !userId) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    const result = await client
      .from("job_companies")
      .select("id,legal_name,verification_status,owner_user_id,created_at")
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: false });
    if (result.error) {
      return { ok: false, reason: "rejected", message: result.error.message || MESSAGES.rejected };
    }
    return { ok: true, rows: result.data || [] };
  }

  async function registerCompany(client, input) {
    const source = input || {};
    const legalName = clean(source.legal_name || source.legalName);
    if (!client || !source.userId) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    if (legalName.length < 2 || legalName.length > 200) {
      return { ok: false, reason: "company_short", message: MESSAGES.company_short };
    }
    const result = await client
      .from("job_companies")
      .insert({
        owner_user_id: source.userId,
        legal_name: legalName,
        verification_status: "unverified"
      })
      .select("id,legal_name,verification_status,owner_user_id,created_at")
      .single();
    const done = confirmed(result);
    if (!done.ok) return done;
    if (done.row.verification_status === "verified") {
      return {
        ok: false,
        reason: "company_not_verified",
        message: "Server returned verified status on insert; refusing to trust self-verification."
      };
    }
    return done;
  }

  return {
    JOB_COLUMNS: JOB_COLUMNS,
    JOB_TYPES: JOB_TYPES,
    PLANS: PLANS,
    CORPORATE_PLANS: CORPORATE_PLANS,
    APPLICATION_COLUMNS: APPLICATION_COLUMNS,
    BLOCKED_UPDATE_FIELDS: BLOCKED_UPDATE_FIELDS,
    isExpired: isExpired,
    isPublicListing: isPublicListing,
    isListedJob: isListedJob,
    jobStatusKind: jobStatusKind,
    jobMatchesType: jobMatchesType,
    jobSearchHaystack: jobSearchHaystack,
    filterJobs: filterJobs,
    normalizeApplicationUrl: normalizeApplicationUrl,
    contactAction: contactAction,
    validateJobDraft: validateJobDraft,
    buildJobUpdate: buildJobUpdate,
    buildJobInsert: buildJobInsert,
    normalizePlan: normalizePlan,
    normalizeCorporatePlan: normalizeCorporatePlan,
    normalizeCurrencyCode: normalizeCurrencyCode,
    formatCurrencyLabel: formatCurrencyLabel,
    companyIsVerified: companyIsVerified,
    companyMayUseCorporate: companyMayUseCorporate,
    buildCorporateSubscriptionQuote: buildCorporateSubscriptionQuote,
    buildApplicationInsert: buildApplicationInsert,
    createOwnJob: createOwnJob,
    updateOwnJob: updateOwnJob,
    deleteOwnJob: deleteOwnJob,
    submitJobApplication: submitJobApplication,
    listApplicationsForJob: listApplicationsForJob,
    loadOwnCompanies: loadOwnCompanies,
    registerCompany: registerCompany
  };

});
