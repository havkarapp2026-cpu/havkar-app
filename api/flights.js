export default async function handler(req, res) {
  // =========================================================
  // HAVKAR FLIGHT API
  // Duffel Test API
  // Supports:
  // - One Way
  // - Round Trip
  // - Adults
  // - Children
  // - Infants
  // - Cabin Class
  // =========================================================

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
      return_date = null,

      // New professional passenger fields
      adults,
      children = 0,
      infants = 0,

      // Backward compatibility with current tickets.html
      passengers,

      cabin_class = "economy"
    } = req.body || {};

    // =========================================================
    // REQUIRED FIELDS
    // =========================================================

    if (!origin || !destination || !departure_date) {
      return res.status(400).json({
        ok: false,
        error: "origin, destination and departure_date are required."
      });
    }

    // =========================================================
    // IATA VALIDATION
    // =========================================================

    const originCode = String(origin)
      .trim()
      .toUpperCase();

    const destinationCode = String(destination)
      .trim()
      .toUpperCase();

    if (
      !/^[A-Z]{3}$/.test(originCode) ||
      !/^[A-Z]{3}$/.test(destinationCode)
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Origin and destination must be valid 3-letter IATA codes."
      });
    }

    if (originCode === destinationCode) {
      return res.status(400).json({
        ok: false,
        error:
          "Origin and destination cannot be the same."
      });
    }

    // =========================================================
    // DATE VALIDATION
    // =========================================================

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!datePattern.test(departure_date)) {
      return res.status(400).json({
        ok: false,
        error:
          "departure_date must use YYYY-MM-DD format."
      });
    }

    if (
      return_date &&
      !datePattern.test(return_date)
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "return_date must use YYYY-MM-DD format."
      });
    }

    if (
      return_date &&
      return_date < departure_date
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Return date cannot be earlier than departure date."
      });
    }

    // =========================================================
    // PASSENGERS
    //
    // Compatibility:
    // Existing tickets.html currently sends:
    // passengers: 1
    //
    // New tickets.html will send:
    // adults: 1
    // children: 0
    // infants: 0
    // =========================================================

    let adultCount;

    if (adults !== undefined) {
      adultCount =
        parseInt(adults, 10);
    } else {
      adultCount =
        parseInt(passengers, 10);
    }

    if (
      !Number.isFinite(adultCount) ||
      adultCount < 1
    ) {
      adultCount = 1;
    }

    let childCount =
      parseInt(children, 10);

    let infantCount =
      parseInt(infants, 10);

    if (
      !Number.isFinite(childCount) ||
      childCount < 0
    ) {
      childCount = 0;
    }

    if (
      !Number.isFinite(infantCount) ||
      infantCount < 0
    ) {
      infantCount = 0;
    }

    adultCount =
      Math.min(adultCount, 9);

    childCount =
      Math.min(childCount, 8);

    infantCount =
      Math.min(infantCount, 8);

    const totalPassengers =
      adultCount +
      childCount +
      infantCount;

    if (totalPassengers > 9) {
      return res.status(400).json({
        ok: false,
        error:
          "A maximum of 9 passengers is allowed."
      });
    }

    if (infantCount > adultCount) {
      return res.status(400).json({
        ok: false,
        error:
          "Each infant must travel with an adult."
      });
    }

    // =========================================================
    // CABIN CLASS
    // =========================================================

    const allowedCabins = [
      "economy",
      "premium_economy",
      "business",
      "first"
    ];

    const requestedCabin =
      String(cabin_class || "economy")
        .trim()
        .toLowerCase();

    const cabin =
      allowedCabins.includes(requestedCabin)
        ? requestedCabin
        : "economy";

    // =========================================================
    // FLIGHT SLICES
    // =========================================================

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

    // =========================================================
    // DUFFEL PASSENGER LIST
    // =========================================================

    const passengerList = [];

    for (
      let index = 0;
      index < adultCount;
      index += 1
    ) {
      passengerList.push({
        type: "adult"
      });
    }

    for (
      let index = 0;
      index < childCount;
      index += 1
    ) {
      passengerList.push({
        type: "child"
      });
    }

    for (
      let index = 0;
      index < infantCount;
      index += 1
    ) {
      passengerList.push({
        type: "infant_without_seat"
      });
    }

    // =========================================================
    // DUFFEL OFFER REQUEST
    // =========================================================

    const requestBody = {
      data: {
        slices,
        passengers: passengerList,
        cabin_class: cabin
      }
    };

    const duffelResponse = await fetch(
      "https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=15000",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${token}`,

          "Duffel-Version":
            "v2",

          Accept:
            "application/json",

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(requestBody)
      }
    );

    // =========================================================
    // SAFE RESPONSE PARSING
    // =========================================================

    const responseText =
      await duffelResponse.text();

    let data = null;

    try {
      data =
        responseText
          ? JSON.parse(responseText)
          : {};
    } catch (parseError) {
      console.error(
        "Duffel returned invalid JSON:",
        responseText
      );

      return res.status(502).json({
        ok: false,
        error:
          "Invalid response received from Duffel."
      });
    }

    // =========================================================
    // DUFFEL ERROR
    // =========================================================

    if (!duffelResponse.ok) {
      console.error(
        "Duffel API error:",
        data
      );

      return res
        .status(duffelResponse.status)
        .json({
          ok: false,
          error:
            "Duffel flight search failed.",
          details:
            data?.errors || null
        });
    }

    // =========================================================
    // SUCCESS
    // =========================================================

    const offerRequest =
      data?.data || null;

    const offers =
      Array.isArray(offerRequest?.offers)
        ? offerRequest.offers
        : [];

    return res.status(200).json({
      ok: true,

      search: {
        trip_type:
          return_date
            ? "round_trip"
            : "one_way",

        origin:
          originCode,

        destination:
          destinationCode,

        departure_date,

        return_date:
          return_date || null,

        cabin_class:
          cabin,

        passengers: {
          adults:
            adultCount,

          children:
            childCount,

          infants:
            infantCount,

          total:
            totalPassengers
        },

        offers_found:
          offers.length
      },

      data:
        offerRequest
    });

  } catch (error) {
    console.error(
      "HAVKAR Duffel API error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        "Internal server error."
    });
  }
}
