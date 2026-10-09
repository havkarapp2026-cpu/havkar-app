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

export default async function handler(req, res) {
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
