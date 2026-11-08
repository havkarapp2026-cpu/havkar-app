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

  function storageErrorMessage(error) {
    if (!error) return "Document could not be uploaded.";
    var msg = String(error.message || error.error || error.statusText || "");
    if (/row-level security|violates|policy|unauthorized|403/i.test(msg)) {
      return "Upload blocked by storage permissions. Sign in again and retry, or contact HAVKAR support if this continues.";
    }
    if (/mime|type|not supported/i.test(msg)) {
      return "Only PDF, JPEG, PNG, or WebP files are accepted.";
    }
    if (/size|too large|payload/i.test(msg)) {
      return "Each file must be between 1 byte and 10 MiB.";
    }
    return msg || "Document could not be uploaded.";
  }

  async function removePriorDocuments(supabaseClient, applicationId, docType) {
    var prior = await supabaseClient
      .from("business_application_documents")
      .select("id,storage_path")
      .eq("application_id", Number(applicationId))
      .eq("doc_type", docType);

    if (prior.error) throw prior.error;
    var rows = prior.data || [];
    if (!rows.length) return;

    var paths = rows.map(function (row) { return row.storage_path; }).filter(Boolean);
    if (paths.length) {
      var delStorage = await supabaseClient.storage.from("business-evidence").remove(paths);
      if (delStorage.error) {
        // Continue: new file is already registered; old object cleanup is best-effort.
        console.warn("Prior evidence storage cleanup failed:", delStorage.error);
      }
    }

    var ids = rows.map(function (row) { return row.id; });
    var delRows = await supabaseClient
      .from("business_application_documents")
      .delete()
      .in("id", ids);
    if (delRows.error) throw delRows.error;
  }

  async function uploadEvidence(supabaseClient, userId, applicationId, docType, file, options) {
    var check = validateFile(file);
    if (!check.ok) throw new Error(check.error);
    var replace = !(options && options.replace === false);
    var path = storagePath(userId, docType, file.name);
    var up = await supabaseClient.storage.from("business-evidence").upload(path, file, {
      contentType: file.type,
      upsert: false
    });
    if (up.error) {
      var err = new Error(storageErrorMessage(up.error));
      err.cause = up.error;
      throw err;
    }
    var reg = await supabaseClient.rpc("register_business_application_document", {
      p_application_id: Number(applicationId),
      p_doc_type: docType,
      p_storage_path: path,
      p_mime_type: file.type,
      p_byte_size: file.size,
      p_original_filename: file.name || null
    });
    if (reg.error) {
      try {
        await supabaseClient.storage.from("business-evidence").remove([path]);
      } catch (_cleanup) { /* ignore */ }
      var regErr = new Error(storageErrorMessage(reg.error));
      regErr.cause = reg.error;
      throw regErr;
    }

    if (replace) {
      try {
        var prior = await supabaseClient
          .from("business_application_documents")
          .select("id,storage_path")
          .eq("application_id", Number(applicationId))
          .eq("doc_type", docType)
          .neq("storage_path", path);
        if (!prior.error && prior.data && prior.data.length) {
          var oldPaths = prior.data.map(function (row) { return row.storage_path; }).filter(Boolean);
          if (oldPaths.length) {
            await supabaseClient.storage.from("business-evidence").remove(oldPaths);
          }
          await supabaseClient
            .from("business_application_documents")
            .delete()
            .in("id", prior.data.map(function (row) { return row.id; }));
        }
      } catch (cleanupError) {
        console.warn("Prior evidence cleanup after replace failed:", cleanupError);
      }
    }

    return reg.data;
  }

  return {
    REQUIRED_DOC_TYPES: REQUIRED_DOC_TYPES,
    DOC_LABELS: DOC_LABELS,
    labelFor: labelFor,
    missingRequired: missingRequired,
    validateFile: validateFile,
    storagePath: storagePath,
    storageErrorMessage: storageErrorMessage,
    removePriorDocuments: removePriorDocuments,
    uploadEvidence: uploadEvidence
  };
});
