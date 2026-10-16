/*
 * HAVKAR jobs rules.
 *
 * A new listing is public and unpaid. Paid promotion is not confirmed here.
 * Employer contact is stored in job_contacts, not on the public jobs row.
 * Update and delete stay limited to the signed-in owner.
 */
(function (root, factory) {

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.HAVKAR_JOBS = api;

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  const JOB_COLUMNS = "id,created_at,user_id,title,company,location,city,country,job_type,salary,description,requirements,contact,status,expires_at,application_url,remote,category,language,experience_level,education_level,skills,currency,salary_min,salary_max,type,image,plan,monthly_fee";

  const CATEGORIES = [
    "Hospitality",
    "Technology",
    "Health",
    "Education",
    "Construction",
    "Transport",
    "Retail",
    "Other"
  ];

  const JOB_TYPES = [
    "Full-time",
    "Part-time",
    "Remote",
    "Freelance",
    "Contract"
  ];

  const PLANS = {
    Basic: 9.99,
    Professional: 19.99,
    Business: 39.99
  };

  const BLOCKED_UPDATE_FIELDS = [
    "status",
    "plan",
    "monthly_fee",
    "user_id",
    "id",
    "created_at"
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
    invalid_category: "Please choose a job category.",
    missing: "Please sign in before continuing.",
    rejected: "The server rejected this change.",
    not_confirmed: "The server did not confirm this change.",
    blocked_fields: "This change is not available.",
    duplicate: "An open listing with this title, city, and country already exists.",
    payment_required: "Paid promotion is not connected. No payment was taken."
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
    if (job.status === "closed") return "closed";
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
      job && job.city,
      job && job.country,
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

  function placeText(job) {
    return [
      job && job.location,
      job && job.city,
      job && job.country
    ].map(function (value) {
      return String(value == null ? "" : value);
    }).join(" ").toLowerCase();
  }

  function filterJobs(list, options) {
    const settings = options || {};
    const query = clean(settings.query).toLowerCase();
    const location = clean(settings.location).toLowerCase();
    const city = clean(settings.city).toLowerCase();
    const country = clean(settings.country).toLowerCase();
    const category = clean(settings.category).toLowerCase();
    return (list || []).filter(function (job) {
      if (!jobMatchesType(job, settings.filter)) return false;
      if (location && !placeText(job).includes(location)) return false;
      if (city && !placeText(job).includes(city)) return false;
      if (country && !placeText(job).includes(country)) return false;
      if (category && clean(job && job.category).toLowerCase() !== category) return false;
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
    const location = clean(source.location);
    const city = clean(source.city);
    const country = clean(source.country);
    const category = clean(source.category);
    const description = clean(source.description);
    const type = clean(source.type || source.job_type);
    const salary = clean(source.salary);
    const skills = skillsText(source.skills);
    const requirements = clean(source.requirements);
    const contact = clean(source.contact);

    if (!title || !company || !location || !description || !city || !country) {
      return { ok: false, reason: "required_fields", message: MESSAGES.required_fields };
    }
    if (city.length < 2 || city.length > 80 || country.length < 2 || country.length > 80) {
      return { ok: false, reason: "required_fields", message: MESSAGES.required_fields };
    }
    if (CATEGORIES.indexOf(category) === -1) {
      return { ok: false, reason: "invalid_category", message: MESSAGES.invalid_category };
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
      city: city,
      country: country,
      category: category,
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
      city: value.city,
      country: value.country,
      category: value.category,
      job_type: value.type,
      type: value.type,
      salary: value.salary || "Negotiable",
      skills: value.skills || "General",
      description: value.description,
      requirements: value.requirements || null,
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
    return { name: name, price: price };
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
    const payload = contentPayload(validation.value);
    payload.user_id = userId;
    payload.image = image.image;
    payload.status = "active";
    payload.plan = chosen.name;
    payload.monthly_fee = chosen.price;
    payload.expires_at = new Date(Date.now() + (60 * 24 * 60 * 60 * 1000)).toISOString();
    if (payload.status !== "active" || Object.prototype.hasOwnProperty.call(payload, "contact")) {
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
      const code = result && result.error && result.error.code;
      return {
        ok: false,
        reason: code === "23505" ? "duplicate" : "rejected",
        message: code === "23505"
          ? MESSAGES.duplicate
          : ((result && result.error && result.error.message) || MESSAGES.rejected)
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
    if (built.payload.status !== "active" || Object.prototype.hasOwnProperty.call(built.payload, "contact")) {
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

  async function closeOwnJob(client, input) {
    const source = input || {};
    if (!client || !source.jobId || !source.userId) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    const result = await client
      .from("jobs")
      .update({ status: "closed" })
      .eq("id", source.jobId)
      .eq("user_id", source.userId)
      .select(JOB_COLUMNS);
    return confirmed(result);
  }

  async function saveJobContact(client, input) {
    const source = input || {};
    const contact = clean(source.contact);
    if (!client || !source.jobId || !source.userId) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    if (!contact) {
      const removed = await client
        .from("job_contacts")
        .delete()
        .eq("job_id", source.jobId)
        .eq("user_id", source.userId);
      if (removed && removed.error) {
        return {
          ok: false,
          reason: "rejected",
          message: removed.error.message || MESSAGES.rejected
        };
      }
      return { ok: true };
    }
    if (contact.length < 3 || contact.length > 200) {
      return { ok: false, reason: "required_fields", message: MESSAGES.required_fields };
    }
    const saved = await client
      .from("job_contacts")
      .upsert({
        job_id: source.jobId,
        user_id: source.userId,
        contact: contact
      }, { onConflict: "job_id" })
      .select("job_id,user_id,contact");
    return confirmed(saved);
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

  return {
    JOB_COLUMNS: JOB_COLUMNS,
    JOB_TYPES: JOB_TYPES,
    CATEGORIES: CATEGORIES,
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
    createOwnJob: createOwnJob,
    updateOwnJob: updateOwnJob,
    closeOwnJob: closeOwnJob,
    saveJobContact: saveJobContact,
    deleteOwnJob: deleteOwnJob
  };

});
