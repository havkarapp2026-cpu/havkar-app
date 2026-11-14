/*
 * HAVKAR job applications.
 *
 * Resumes stay in the private job-resumes bucket.
 * Status values match public.job_applications CHECK constraint.
 * Messages use the existing conversations and messages tables.
 * This file does not confirm payment or grant a role.
 */
(function (root, factory) {

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.HAVKAR_JOB_APPLICATIONS = api;

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  const APPLICATION_COLUMNS =
    "id,job_id,applicant_id,cover_letter,resume_path,status,conversation_id,employer_notes,interview_at,applicant_consent_at,withdrawn_at,created_at,updated_at";
  const RESUME_BUCKET = "job-resumes";
  const MAX_RESUME_BYTES = 5242880;
  const MIME_EXTENSIONS = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"
  };

  const APPLICANT_STATUSES = [
    "submitted",
    "under_review",
    "shortlisted",
    "interview",
    "rejected",
    "hired",
    "withdrawn"
  ];

  const EMPLOYER_DECISIONS = [
    "under_review",
    "shortlisted",
    "interview",
    "rejected",
    "hired"
  ];

  const MESSAGES = {
    missing: "Please sign in before continuing.",
    invalid_resume: "Choose a PDF, DOC, or DOCX resume up to 5 MB.",
    rejected: "The server rejected this change.",
    not_confirmed: "The server did not confirm this change.",
    duplicate: "You already applied to this job.",
    invalid_decision: "Choose a valid application decision.",
    consent_required: "Applicant consent is required before interview scheduling."
  };

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function newId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    return "00000000-0000-4000-8000-000000000000";
  }

  function extensionFor(file) {
    const type = String((file && file.type) || "").toLowerCase();
    const name = String((file && file.name) || "").toLowerCase();
    const fromType = MIME_EXTENSIONS[type] || "";
    const fromName = name.endsWith(".pdf")
      ? "pdf"
      : name.endsWith(".docx")
        ? "docx"
        : name.endsWith(".doc")
          ? "doc"
          : "";
    if (fromType && fromName && fromType !== fromName) return "";
    if (fromType && !fromName && /\.[a-z0-9]+$/.test(name)) return "";
    return fromType || fromName;
  }

  function validateResumeFile(file) {
    if (!file) return { ok: true, extension: "" };
    const extension = extensionFor(file);
    const size = Number(file.size);
    if (!extension || !Number.isFinite(size) || size <= 0 || size > MAX_RESUME_BYTES) {
      return { ok: false, reason: "invalid_resume", message: MESSAGES.invalid_resume };
    }
    return { ok: true, extension: extension };
  }

  function buildResumePath(applicantId, applicationId, extension) {
    const applicant = clean(applicantId).toLowerCase();
    const application = clean(applicationId).toLowerCase();
    const suffix = clean(extension).toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(applicant)) {
      return "";
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(application)) {
      return "";
    }
    if (suffix !== "pdf" && suffix !== "doc" && suffix !== "docx") return "";
    return applicant + "/" + application + "." + suffix;
  }

  function oneRow(data) {
    if (Array.isArray(data)) return data.length === 1 ? data[0] : null;
    if (data && typeof data === "object") {
      if (data.id != null || data.user_id != null) return data;
    }
    return null;
  }

  function confirmed(result, duplicateMessage) {
    if (!result || result.error) {
      const code = result && result.error && result.error.code;
      return {
        ok: false,
        reason: code === "23505" ? "duplicate" : "rejected",
        message: code === "23505"
          ? (duplicateMessage || MESSAGES.duplicate)
          : ((result && result.error && result.error.message) || MESSAGES.rejected)
      };
    }
    const row = oneRow(result.data);
    if (!row) {
      return { ok: false, reason: "not_confirmed", message: MESSAGES.not_confirmed };
    }
    return { ok: true, row: row };
  }

  function validateApplicantProfile(profile) {
    const source = profile || {};
    const headline = clean(source.headline);
    const summary = clean(source.summary);
    const skills = clean(source.skills);
    const location = clean(source.location);
    if (headline && (headline.length < 2 || headline.length > 120)) {
      return { ok: false, reason: "rejected", message: MESSAGES.rejected };
    }
    if (summary.length > 3000 || skills.length > 500 || location.length > 120) {
      return { ok: false, reason: "rejected", message: MESSAGES.rejected };
    }
    return {
      ok: true,
      value: {
        headline: headline || null,
        summary: summary || null,
        skills: skills || null,
        location: location || null
      }
    };
  }

  async function upsertApplicantProfile(client, input) {
    const source = input || {};
    const userId = clean(source.userId);
    if (!client || !userId) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    const validated = validateApplicantProfile(source.profile);
    if (!validated.ok) return validated;
    const payload = Object.assign({ user_id: userId, updated_at: new Date().toISOString() }, validated.value);
    const result = await client
      .from("job_applicant_profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select("user_id,headline,summary,skills,location,updated_at")
      .single();
    return confirmed(result);
  }

  async function submitApplication(client, input) {
    const source = input || {};
    const applicantId = clean(source.applicantId);
    const jobId = source.jobId;
    const cover = clean(source.coverLetter);
    const consent = source.applicantConsent === true;
    if (!client || !applicantId || jobId == null) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    if (!consent) {
      return { ok: false, reason: "consent_required", message: MESSAGES.consent_required };
    }
    if (cover.length > 5000) {
      return { ok: false, reason: "rejected", message: MESSAGES.rejected };
    }
    const resume = validateResumeFile(source.file);
    if (!resume.ok) return resume;
    const id = newId();
    let resumePath = "";
    if (source.file) {
      resumePath = buildResumePath(applicantId, id, resume.extension);
      if (!resumePath || !client.storage) {
        return { ok: false, reason: "invalid_resume", message: MESSAGES.invalid_resume };
      }
      const uploaded = await client.storage.from(RESUME_BUCKET).upload(resumePath, source.file, {
        contentType: source.file.type || "application/octet-stream",
        upsert: false
      });
      if (!uploaded || uploaded.error) {
        return {
          ok: false,
          reason: "rejected",
          message: (uploaded && uploaded.error && uploaded.error.message) || MESSAGES.rejected
        };
      }
    }
    const inserted = await client
      .from("job_applications")
      .insert({
        id: id,
        job_id: jobId,
        applicant_id: applicantId,
        cover_letter: cover || null,
        resume_path: resumePath || null,
        status: "submitted",
        applicant_consent_at: new Date().toISOString()
      })
      .select(APPLICATION_COLUMNS)
      .single();
    const saved = confirmed(inserted);
    if (!saved.ok && resumePath && client.storage) {
      await client.storage.from(RESUME_BUCKET).remove([resumePath]);
    }
    return saved;
  }

  async function listMine(client, applicantId) {
    if (!client || !applicantId) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    const result = await client
      .from("job_applications")
      .select(APPLICATION_COLUMNS + ",jobs(id,title,company,user_id,status)")
      .eq("applicant_id", applicantId)
      .order("created_at", { ascending: false });
    if (!result || result.error) {
      return {
        ok: false,
        reason: "rejected",
        message: (result && result.error && result.error.message) || MESSAGES.rejected
      };
    }
    return { ok: true, rows: Array.isArray(result.data) ? result.data : [] };
  }

  async function listForJob(client, jobId, employerId) {
    if (!client || jobId == null || !employerId) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    const owned = await client
      .from("jobs")
      .select("id")
      .eq("id", jobId)
      .eq("user_id", employerId)
      .maybeSingle();
    if (!owned || owned.error || !owned.data) {
      return { ok: false, reason: "rejected", message: MESSAGES.rejected };
    }
    const result = await client
      .from("job_applications")
      .select(APPLICATION_COLUMNS)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    if (!result || result.error) {
      return {
        ok: false,
        reason: "rejected",
        message: (result && result.error && result.error.message) || MESSAGES.rejected
      };
    }
    return { ok: true, rows: Array.isArray(result.data) ? result.data : [] };
  }

  async function decideApplication(client, input) {
    const source = input || {};
    const status = clean(source.status);
    if (!client || !source.applicationId) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    if (EMPLOYER_DECISIONS.indexOf(status) === -1 && status !== "withdrawn") {
      return { ok: false, reason: "invalid_decision", message: MESSAGES.invalid_decision };
    }
    const patch = {
      status: status,
      updated_at: new Date().toISOString()
    };
    if (status === "withdrawn") {
      patch.withdrawn_at = new Date().toISOString();
    }
    if (Object.prototype.hasOwnProperty.call(source, "employerNotes")) {
      patch.employer_notes = clean(source.employerNotes).slice(0, 2000) || null;
    }
    if (status === "interview") {
      const when = Date.parse(source.interviewAt);
      if (!Number.isFinite(when)) {
        return { ok: false, reason: "invalid_decision", message: "Interview time is required." };
      }
      patch.interview_at = new Date(when).toISOString();
    }
    let query = client
      .from("job_applications")
      .update(patch)
      .eq("id", source.applicationId);
    if (source.applicantId) {
      query = query.eq("applicant_id", source.applicantId);
    }
    const result = await query.select(APPLICATION_COLUMNS);
    return confirmed(result);
  }

  async function openConversation(client, input) {
    const source = input || {};
    const application = source.application || {};
    const applicantId = clean(source.applicantId || application.applicant_id);
    const employerId = clean(source.employerId);
    if (!client || !application.id || !applicantId || !employerId || applicantId === employerId) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    if (application.conversation_id) {
      return { ok: true, conversationId: application.conversation_id, row: application };
    }
    const created = await client
      .from("conversations")
      .insert({
        ad_id: null,
        buyer_id: applicantId,
        seller_id: employerId
      })
      .select("id")
      .single();
    if (!created || created.error || !created.data || !created.data.id) {
      return {
        ok: false,
        reason: "rejected",
        message: (created && created.error && created.error.message) || MESSAGES.rejected
      };
    }
    const linked = await client
      .from("job_applications")
      .update({ conversation_id: created.data.id })
      .eq("id", application.id)
      .select(APPLICATION_COLUMNS);
    const saved = confirmed(linked);
    if (!saved.ok) return saved;
    return { ok: true, conversationId: created.data.id, row: saved.row };
  }

  async function resumeSignedUrl(client, path) {
    const resumePath = clean(path);
    if (!client || !client.storage || !resumePath || resumePath.indexOf("..") !== -1) {
      return { ok: false, reason: "missing", message: MESSAGES.missing };
    }
    const signed = await client.storage.from(RESUME_BUCKET).createSignedUrl(resumePath, 60);
    if (!signed || signed.error || !signed.data || !signed.data.signedUrl) {
      return {
        ok: false,
        reason: "rejected",
        message: (signed && signed.error && signed.error.message) || MESSAGES.rejected
      };
    }
    return { ok: true, url: signed.data.signedUrl };
  }

  function fraudSignals(job, recentTitles) {
    const title = clean(job && job.title).toLowerCase();
    const duplicates = (recentTitles || []).filter(function (row) {
      return clean(row).toLowerCase() === title;
    }).length;
    const feeAsk = /registration fee|upfront fee|send money|crypto payment to apply/i.test(
      String((job && job.description) || "") + " " + String((job && job.requirements) || "")
    );
    return {
      duplicate_title_count: duplicates,
      illegal_recruitment_fee_language: feeAsk,
      block_publish: feeAsk || duplicates >= 3
    };
  }

  return {
    APPLICATION_COLUMNS: APPLICATION_COLUMNS,
    RESUME_BUCKET: RESUME_BUCKET,
    APPLICANT_STATUSES: APPLICANT_STATUSES,
    EMPLOYER_DECISIONS: EMPLOYER_DECISIONS,
    validateResumeFile: validateResumeFile,
    buildResumePath: buildResumePath,
    validateApplicantProfile: validateApplicantProfile,
    upsertApplicantProfile: upsertApplicantProfile,
    submitApplication: submitApplication,
    listMine: listMine,
    listForJob: listForJob,
    decideApplication: decideApplication,
    openConversation: openConversation,
    resumeSignedUrl: resumeSignedUrl,
    fraudSignals: fraudSignals
  };

});
