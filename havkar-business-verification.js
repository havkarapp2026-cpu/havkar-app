(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HAVKAR_BUSINESS_VERIFICATION = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var REQUIRED_DOC_TYPES = [
    "vat_registration",
    "company_registration",
    "proof_of_registered_address"
  ];

  var DOC_LABELS = {
    vat_registration: "VAT / Partita IVA registration certificate",
    company_registration: "Company or business registration extract",
    proof_of_registered_address: "Proof of registered business address",
    other_supporting: "Other supporting document"
  };

  var ALLOWED_MIME = {
    "application/pdf": true,
    "image/jpeg": true,
    "image/png": true,
    "image/webp": true
  };

  var MAX_BYTES = 10485760;

  function labelFor(docType) {
    return DOC_LABELS[String(docType || "")] || String(docType || "");
  }

  function missingRequired(existingTypes) {
    var have = {};
    (existingTypes || []).forEach(function (t) {
      have[String(t)] = true;
    });
    return REQUIRED_DOC_TYPES.filter(function (t) {
      return !have[t];
    });
  }

  function validateFile(file) {
    if (!file) return { ok: false, error: "Choose a file." };
    if (!ALLOWED_MIME[file.type]) {
      return { ok: false, error: "Only PDF, JPEG, PNG, or WebP files are accepted." };
    }
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_BYTES) {
      return { ok: false, error: "Each file must be between 1 byte and 10 MiB." };
    }
    var name = String(file.name || "").toLowerCase();
    if (/(^|[^a-z])(passport|selfie|id[_-]?card|identity)([^a-z]|$)/.test(name)) {
      return { ok: false, error: "Identity documents cannot be uploaded here." };
    }
    return { ok: true };
  }

  function storagePath(userId, docType, filename) {
    var safe = String(filename || "evidence.bin")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 120);
    return String(userId) + "/" + docType + "/" + Date.now() + "-" + safe;
  }

  async function uploadEvidence(supabaseClient, userId, applicationId, docType, file) {
    var check = validateFile(file);
    if (!check.ok) throw new Error(check.error);
    var path = storagePath(userId, docType, file.name);
    var up = await supabaseClient.storage.from("business-evidence").upload(path, file, {
      contentType: file.type,
      upsert: false
    });
    if (up.error) throw up.error;
    var reg = await supabaseClient.rpc("register_business_application_document", {
      p_application_id: Number(applicationId),
      p_doc_type: docType,
      p_storage_path: path,
      p_mime_type: file.type,
      p_byte_size: file.size,
      p_original_filename: file.name || null
    });
    if (reg.error) throw reg.error;
    return reg.data;
  }

  return {
    REQUIRED_DOC_TYPES: REQUIRED_DOC_TYPES,
    DOC_LABELS: DOC_LABELS,
    labelFor: labelFor,
    missingRequired: missingRequired,
    validateFile: validateFile,
    storagePath: storagePath,
    uploadEvidence: uploadEvidence
  };
});
