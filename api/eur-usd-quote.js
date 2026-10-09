const QUOTE_URL = "https://api.frankfurter.app/latest?from=EUR&to=USD";

function sendError(res, status, message) {
  return res.status(status).json({
    ok: false,
    error: message,
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendError(res, 405, "Method not allowed");
  }

  try {
    const response = await fetch(QUOTE_URL);

    if (!response.ok) {
      return sendError(res, 502, "Quotation unavailable");
    }

    const payload = await response.json();
    const rate = Number(payload && payload.rates && payload.rates.USD);

    if (payload?.base !== "EUR" || !Number.isFinite(rate) || rate <= 0) {
      return sendError(res, 502, "Quotation unavailable");
    }

    return res.status(200).json({
      ok: true,
      base: "EUR",
      date: payload.date || "",
      rates: {
        USD: rate,
      },
      quoted_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("HAVKAR EUR/USD quote error:", error);
    return sendError(res, 502, "Quotation unavailable");
  }
}
