const QUOTE_URL = "https://api.frankfurter.dev/v2/rate/EUR/USD";
const QUOTE_TIMEOUT_MS = 8000;

function sendError(res, status, message) {
  return res.status(status).json({
    ok: false,
    error: message,
  });
}

function readRate(payload) {
  if (!payload || payload.base !== "EUR" || payload.quote !== "USD") {
    return null;
  }

  const rate = Number(payload.rate);

  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  const date = typeof payload.date === "string" ? payload.date : "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  return { rate: rate, date: date };
}

function isIdeasStudioRequest(req) {
  const q = req.query || {};
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const marker = String(
    q.havkarAction || q.havkarRoute || body.havkarAction || ""
  ).toLowerCase();
  if (marker === "ideas_studio" || marker === "ideas-studio") return true;
  const action = String(body.action || q.action || "").toLowerCase();
  return (
    action.startsWith("ideas_") ||
    action.startsWith("list_ideas") ||
    action.startsWith("save_idea") ||
    action.startsWith("submit_idea") ||
    action.startsWith("review_idea") ||
    action.startsWith("create_venture") ||
    action.startsWith("list_ventures") ||
    action.startsWith("update_venture") ||
    action.startsWith("request_publish") ||
    action.startsWith("moderate_venture") ||
    action.startsWith("ledger_") ||
    action.startsWith("add_simulated") ||
    action.startsWith("present_agreement") ||
    action.startsWith("accept_agreement") ||
    action.startsWith("aldo_") ||
    action === "list_templates" ||
    action === "ideas_studio_status" ||
    action === "analyze_idea" ||
    action === "billing_quote" ||
    action === "marketplace_prepare"
  );
}

export default async function handler(req, res) {
  if (isIdeasStudioRequest(req)) {
    try {
      const studio = await import("../lib/ideas-studio-api.mjs");
      return await studio.handleIdeasStudioRequest(req, res);
    } catch (error) {
      console.error(
        "Ideas Studio handler error:",
        error instanceof Error ? error.message : error
      );
      return res.status(500).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Ideas Studio handler failed."
      });
    }
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendError(res, 405, "Method not allowed");
  }

  try {
    const response = await fetch(QUOTE_URL, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return sendError(res, 502, "Quotation unavailable");
    }

    const quote = readRate(await response.json());

    if (!quote) {
      return sendError(res, 502, "Quotation unavailable");
    }

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      ok: true,
      base: "EUR",
      date: quote.date,
      rates: {
        USD: quote.rate,
      },
      quoted_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("HAVKAR EUR/USD quote error:", error);
    return sendError(res, 502, "Quotation unavailable");
  }
}
