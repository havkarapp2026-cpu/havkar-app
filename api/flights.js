export default async function handler(req, res) {
  // CORS / allowed methods
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  const token = process.env.DUFFEL_ACCESS_TOKEN;

  if (!token) {
    return res.status(500).json({
      ok: false,
      error: "Duffel API token is not configured."
    });
  }

  try {
    const {
      origin,
      destination,
      departure_date,
      return_date,
      passengers = 1,
      cabin_class = "economy"
    } = req.body || {};

    if (!origin || !destination || !departure_date) {
      return res.status(400).json({
        ok: false,
        error: "origin, destination and departure_date are required."
      });
    }

    const originCode = String(origin).trim().toUpperCase();
    const destinationCode = String(destination).trim().toUpperCase();

    if (
      !/^[A-Z]{3}$/.test(originCode) ||
      !/^[A-Z]{3}$/.test(destinationCode)
    ) {
      return res.status(400).json({
        ok: false,
        error: "Origin and destination must be valid 3-letter IATA codes."
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(departure_date)) {
      return res.status(400).json({
        ok: false,
        error: "departure_date must use YYYY-MM-DD format."
      });
    }

    if (
      return_date &&
      !/^\d{4}-\d{2}-\d{2}$/.test(return_date)
    ) {
      return res.status(400).json({
        ok: false,
        error: "return_date must use YYYY-MM-DD format."
      });
    }

    const passengerCount = Math.min(
      Math.max(parseInt(passengers, 10) || 1, 1),
      9
    );

    const allowedCabins = [
      "economy",
      "premium_economy",
      "business",
      "first"
    ];

    const cabin = allowedCabins.includes(cabin_class)
      ? cabin_class
      : "economy";

    const slices = [
      {
        origin: originCode,
        destination: destinationCode,
        departure_date
      }
    ];

    if (return_date) {
      slices.push({
        origin: destinationCode,
        destination: originCode,
        departure_date: return_date
      });
    }

    const passengerList = Array.from(
      { length: passengerCount },
      () => ({ type: "adult" })
    );

    const duffelResponse = await fetch(
      "https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=15000",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Duffel-Version": "v2",
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          data: {
            slices,
            passengers: passengerList,
            cabin_class: cabin
          }
        })
      }
    );

    const data = await duffelResponse.json();

    if (!duffelResponse.ok) {
      console.error("Duffel API error:", data);

      return res.status(duffelResponse.status).json({
        ok: false,
        error: "Duffel flight search failed.",
        details: data?.errors || null
      });
    }

    return res.status(200).json({
      ok: true,
      data: data.data
    });

  } catch (error) {
    console.error("HAVKAR Duffel API error:", error);

    return res.status(500).json({
      ok: false,
      error: "Internal server error."
    });
  }
}
