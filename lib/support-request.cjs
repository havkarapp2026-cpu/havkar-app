const crypto = require("crypto");

const TOPICS = [
  "account_recovery",
  "login_registration",
  "technical",
  "payment",
  "marketplace_dispute",
  "privacy",
  "account_deletion",
  "other"
];

const LANGUAGES = ["en", "fa", "it", "sv", "ckb", "kmr", "ar"];
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SUPPORT_INBOX = "info@havkar.online";
const SUPPORT_FROM = "HAVKAR <notifications@havkar.online>";

function clip(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function escapeHtml(value) {
  return clip(value, 4000)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 180;
}

function honeypotTripped(body) {
  return clip(body && body.company_website, 200) !== "";
}

function validateSupportRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "Enter the support details." };
  }

  if (honeypotTripped(body)) {
    return { ok: false, status: 400, error: "The support request could not be accepted." };
  }

  const topic = clip(body.topic, 40);
  const name = clip(body.name, 80);
  const email = clip(body.email, 180).toLowerCase();
  const message = clip(body.message, 4000);
  const language = clip(body.language, 8).toLowerCase();

  if (!TOPICS.includes(topic)) {
    return { ok: false, status: 400, error: "Choose a support topic." };
  }

  if (name.length < 2) {
    return { ok: false, status: 400, error: "Enter your name." };
  }

  if (!validEmail(email)) {
    return { ok: false, status: 400, error: "Enter a valid email address." };
  }

  if (message.length < 20) {
    return { ok: false, status: 400, error: "Describe the problem in at least 20 characters." };
  }

  if (!LANGUAGES.includes(language)) {
    return { ok: false, status: 400, error: "Choose a supported language." };
  }

  return {
    ok: true,
    value: { topic, name, email, message, language }
  };
}

function validateStatusLookup(body) {
  const reference = clip(body && body.reference, 16).toUpperCase();
  const email = clip(body && body.email, 180).toLowerCase();

  if (!/^[A-Z2-9]{10}$/.test(reference) || !validEmail(email)) {
    return { ok: false, status: 400, error: "Enter the request reference and the same email address." };
  }

  return { ok: true, value: { reference, email } };
}

function createReference(bytes) {
  const source = bytes || crypto.randomBytes(10);
  let text = "";

  for (let index = 0; index < 10; index += 1) {
    text += REFERENCE_ALPHABET[source[index] % REFERENCE_ALPHABET.length];
  }

  return text;
}

function requesterConfirmation(request, reference) {
  const safeReference = clip(reference, 10).replace(/[\r\n]/g, "");

  return {
    from: SUPPORT_FROM,
    to: [request.email],
    subject: "HAVKAR support reference " + safeReference,
    html:
      "<p>HAVKAR received your support request.</p>" +
      "<p><strong>Reference:</strong> " + escapeHtml(safeReference) + "</p>" +
      "<p>Check the status with this reference and the same email address. This message does not include the text you sent.</p>"
  };
}

function supportEmailMessage(request, reference) {
  const safeReference = clip(reference, 10).replace(/[\r\n]/g, "");

  return {
    from: SUPPORT_FROM,
    to: [SUPPORT_INBOX],
    reply_to: request.email,
    subject: "HAVKAR support " + safeReference,
    html:
      "<p>A HAVKAR support request was stored.</p>" +
      "<p><strong>Reference:</strong> " + escapeHtml(safeReference) + "</p>" +
      "<p><strong>Topic:</strong> " + escapeHtml(request.topic) + "</p>" +
      "<p><strong>Name:</strong> " + escapeHtml(request.name) + "</p>" +
      "<p><strong>Email:</strong> " + escapeHtml(request.email) + "</p>" +
      "<p><strong>Language:</strong> " + escapeHtml(request.language) + "</p>" +
      "<p style=\"white-space:pre-wrap\">" + escapeHtml(request.message) + "</p>"
  };
}

function clientIp(req) {
  const header = req && req.headers ? req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"] : "";
  const raw = Array.isArray(header) ? header[0] : String(header || "");
  const first = raw.split(",")[0].trim().replace(/^::ffff:/, "");

  if (!/^[0-9A-Fa-f:.]+$/.test(first) || first.length < 3 || first.length > 45) {
    return "";
  }

  return first;
}

function isSupportRequest(req) {
  const action = String(req && req.query && req.query.havkarAction || "");
  const url = String(req && req.url || "");
  return action === "support" || url.indexOf("support-request") !== -1;
}

function createSupportRequestHandler({
  createSupabase,
  fetchImpl,
  randomBytes
} = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const body = req.body || {};
    const action = clip(body.action, 20) || "create";
    const supabase = createSupabase ? createSupabase() : null;

    if (!supabase) {
      return res.status(503).json({
        ok: false,
        stored: false,
        notified: false,
        error: "Support storage is not configured."
      });
    }

    const ip = clientIp(req);

    if (!ip) {
      return res.status(400).json({ ok: false, error: "The request could not be accepted." });
    }

    if (action === "status") {
      const lookup = validateStatusLookup(body);

      if (!lookup.ok) {
        return res.status(lookup.status).json({ ok: false, error: lookup.error });
      }

      const { data, error } = await supabase
        .from("support_requests")
        .select("reference,status,topic,created_at")
        .eq("reference", lookup.value.reference)
        .eq("requester_email", lookup.value.email)
        .maybeSingle();

      if (error) {
        return res.status(500).json({ ok: false, error: "The request status could not be read." });
      }

      if (!data) {
        return res.status(404).json({ ok: false, error: "No matching support request was found." });
      }

      return res.status(200).json({
        ok: true,
        reference: data.reference,
        status: data.status,
        topic: data.topic,
        created_at: data.created_at
      });
    }

    const parsed = validateSupportRequest(body);

    if (!parsed.ok) {
      return res.status(parsed.status).json({ ok: false, stored: false, error: parsed.error });
    }

    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const recent = await supabase
      .from("support_requests")
      .select("reference,message")
      .eq("requester_email", parsed.value.email)
      .gte("created_at", since)
      .limit(5);
    const duplicate = recent && !recent.error && Array.isArray(recent.data)
      ? recent.data.find(function (row) { return row && row.message === parsed.value.message; })
      : null;

    if (duplicate && duplicate.reference) {
      return res.status(200).json({
        ok: true,
        stored: true,
        duplicate: true,
        notified: false,
        requester_notified: false,
        reference: duplicate.reference
      });
    }

    const budget = await supabase.rpc("consume_support_budget", {
      p_email: parsed.value.email,
      p_client_ip: ip
    });

    if (budget.error) {
      return res.status(503).json({
        ok: false,
        stored: false,
        notified: false,
        error: "Support storage is not ready."
      });
    }

    if (budget.data !== true) {
      return res.status(429).json({
        ok: false,
        stored: false,
        error: "Too many support requests. Wait and try again."
      });
    }

    const reference = createReference(randomBytes ? randomBytes(10) : undefined);
    const inserted = await supabase
      .from("support_requests")
      .insert({
        reference,
        topic: parsed.value.topic,
        requester_name: parsed.value.name,
        requester_email: parsed.value.email,
        message: parsed.value.message,
        language_code: parsed.value.language,
        status: "received"
      })
      .select("reference")
      .single();

    if (inserted.error || !inserted.data) {
      return res.status(500).json({
        ok: false,
        stored: false,
        notified: false,
        error: "The support request could not be stored."
      });
    }

    if (!process.env.RESEND_API_KEY || typeof fetchImpl !== "function") {
      return res.status(200).json({
        ok: true,
        stored: true,
        notified: false,
        reference: inserted.data.reference
      });
    }

    const messages = [
      supportEmailMessage(parsed.value, inserted.data.reference),
      requesterConfirmation(parsed.value, inserted.data.reference)
    ];
    const delivered = [];

    for (let index = 0; index < messages.length; index += 1) {
      try {
        const response = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + process.env.RESEND_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(messages[index])
        });
        delivered.push(Boolean(response && response.ok));
      } catch (error) {
        delivered.push(false);
      }
    }

    return res.status(200).json({
      ok: true,
      stored: true,
      notified: delivered[0] === true,
      requester_notified: delivered[1] === true,
      reference: inserted.data.reference
    });
  };
}

module.exports = {
  TOPICS,
  LANGUAGES,
  SUPPORT_INBOX,
  validateSupportRequest,
  validateStatusLookup,
  honeypotTripped,
  createReference,
  supportEmailMessage,
  requesterConfirmation,
  clientIp,
  isSupportRequest,
  createSupportRequestHandler
};
