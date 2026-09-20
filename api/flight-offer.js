// HAVKAR - Duffel Flight Offer API
// File: /api/flight-offer.js
//
// Purpose:
// Retrieve the latest version of a selected Duffel flight offer
// before HAVKAR continues to passenger details / checkout.
//
// Security:
// DUFFEL_ACCESS_TOKEN stays server-side in Vercel.
// Never expose the token in tickets.html or public client code.

const DUFFEL_API_BASE = "https://api.duffel.com";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, payload) {
  return res.status(status).json(payload);
}

function cleanString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isValidOfferId(value) {
  return /^off_[A-Za-z0-9]+$/.test(value);
}

async function readRequestBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return {};
}

async function readDuffelResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text
    };
  }
}

function getDuffelErrorMessage(payload) {
  const errors = payload?.errors;

  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];

    return (
      first?.message ||
      first?.title ||
      first?.code ||
      "Duffel returned an error."
    );
  }

  return "Duffel returned an error.";
}

function mapPlace(place) {
  if (!place || typeof place !== "object") {
    return null;
  }

  return {
    id: place.id || null,
    name: place.name || null,
    iata_code: place.iata_code || null,
    city_name: place.city_name || null,
    iata_city_code: place.iata_city_code || null,
    type: place.type || null,
    time_zone: place.time_zone || null
  };
}

function mapAirline(airline) {
  if (!airline || typeof airline !== "object") {
    return null;
  }

  return {
    id: airline.id || null,
    name: airline.name || null,
    iata_code: airline.iata_code || null,
    logo_symbol_url: airline.logo_symbol_url || null,
    logo_lockup_url: airline.logo_lockup_url || null
  };
}

function mapAircraft(aircraft) {
  if (!aircraft || typeof aircraft !== "object") {
    return null;
  }

  return {
    id: aircraft.id || null,
    name: aircraft.name || null,
    iata_code: aircraft.iata_code || null
  };
}

function mapBaggage(baggage) {
  if (!baggage || typeof baggage !== "object") {
    return null;
  }

  return {
    type: baggage.type || null,
    quantity:
      typeof baggage.quantity === "number"
        ? baggage.quantity
        : null
  };
}

function mapPassengerBaggages(passenger) {
  const baggages = Array.isArray(passenger?.baggages)
    ? passenger.baggages
    : [];

  return baggages
    .map(mapBaggage)
    .filter(Boolean);
}

function mapSegmentPassenger(passenger) {
  if (!passenger || typeof passenger !== "object") {
    return null;
  }

  return {
    passenger_id: passenger.passenger_id || null,
    cabin_class: passenger.cabin_class || null,
    cabin_class_marketing_name:
      passenger.cabin_class_marketing_name || null,
    fare_basis_code: passenger.fare_basis_code || null,
    baggages: mapPassengerBaggages(passenger)
  };
}

function mapSegment(segment) {
  if (!segment || typeof segment !== "object") {
    return null;
  }

  const passengers = Array.isArray(segment.passengers)
    ? segment.passengers
        .map(mapSegmentPassenger)
        .filter(Boolean)
    : [];

  return {
    id: segment.id || null,

    origin: mapPlace(segment.origin),
    destination: mapPlace(segment.destination),

    departing_at: segment.departing_at || null,
    arriving_at: segment.arriving_at || null,
    duration: segment.duration || null,

    marketing_carrier: mapAirline(segment.marketing_carrier),
    operating_carrier: mapAirline(segment.operating_carrier),

    marketing_carrier_flight_number:
      segment.marketing_carrier_flight_number || null,

    operating_carrier_flight_number:
      segment.operating_carrier_flight_number || null,

    aircraft: mapAircraft(segment.aircraft),

    origin_terminal: segment.origin_terminal || null,
    destination_terminal: segment.destination_terminal || null,

    passengers
  };
}

function mapSlice(slice) {
  if (!slice || typeof slice !== "object") {
    return null;
  }

  const segments = Array.isArray(slice.segments)
    ? slice.segments.map(mapSegment).filter(Boolean)
    : [];

  return {
    id: slice.id || null,

    origin: mapPlace(slice.origin),
    destination: mapPlace(slice.destination),

    duration: slice.duration || null,

    fare_brand_name: slice.fare_brand_name || null,

    conditions: slice.conditions || null,

    segments,

    stops: Math.max(0, segments.length - 1)
  };
}

function mapOfferPassenger(passenger) {
  if (!passenger || typeof passenger !== "object") {
    return null;
  }

  return {
    id: passenger.id || null,
    type: passenger.type || null,
    age:
      typeof passenger.age === "number"
        ? passenger.age
        : null,
    given_name: passenger.given_name || null,
    family_name: passenger.family_name || null
  };
}

function mapService(service) {
  if (!service || typeof service !== "object") {
    return null;
  }

  return {
    id: service.id || null,
    type: service.type || null,

    total_amount: service.total_amount || null,
    total_currency: service.total_currency || null,

    passenger_ids: Array.isArray(service.passenger_ids)
      ? service.passenger_ids
      : [],

    segment_ids: Array.isArray(service.segment_ids)
      ? service.segment_ids
      : [],

    maximum_quantity:
      typeof service.maximum_quantity === "number"
        ? service.maximum_quantity
        : null,

    metadata: service.metadata || null
  };
}

function mapOffer(offer) {
  if (!offer || typeof offer !== "object") {
    return null;
  }

  const slices = Array.isArray(offer.slices)
    ? offer.slices.map(mapSlice).filter(Boolean)
    : [];

  const passengers = Array.isArray(offer.passengers)
    ? offer.passengers
        .map(mapOfferPassenger)
        .filter(Boolean)
    : [];

  const availableServices = Array.isArray(offer.available_services)
    ? offer.available_services
        .map(mapService)
        .filter(Boolean)
    : [];

  const owner = mapAirline(offer.owner);

  return {
    id: offer.id || null,

    live_mode: offer.live_mode === true,

    created_at: offer.created_at || null,
    updated_at: offer.updated_at || null,
    expires_at: offer.expires_at || null,

    total_amount: offer.total_amount || null,
    total_currency: offer.total_currency || null,

    base_amount: offer.base_amount || null,
    base_currency: offer.base_currency || null,

    tax_amount: offer.tax_amount || null,
    tax_currency: offer.tax_currency || null,

    total_emissions_kg:
      offer.total_emissions_kg || null,

    owner,

    payment_requirements:
      offer.payment_requirements || null,

    conditions:
      offer.conditions || null,

    supported_passenger_identity_document_types:
      Array.isArray(
        offer.supported_passenger_identity_document_types
      )
        ? offer.supported_passenger_identity_document_types
        : [],

    passengers,

    slices,

    available_services: availableServices
  };
}

async function fetchDuffelOffer(accessToken, offerId) {
  const url =
    `${DUFFEL_API_BASE}/air/offers/` +
    `${encodeURIComponent(offerId)}` +
    `?return_available_services=true`;

  const response = await fetch(url, {
    method: "GET",

    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "Duffel-Version": "v2",
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = await readDuffelResponse(response);

  return {
    response,
    payload
  };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");

    return sendJson(res, 405, {
      ok: false,
      error: "Method not allowed."
    });
  }

  const accessToken =
    process.env.DUFFEL_ACCESS_TOKEN;

  if (!accessToken) {
    return sendJson(res, 500, {
      ok: false,
      error:
        "DUFFEL_ACCESS_TOKEN is not configured on the server."
    });
  }

  let offerId = "";

  if (req.method === "GET") {
    offerId = cleanString(req.query?.offer_id);
  } else {
    const body = await readRequestBody(req);

    offerId = cleanString(
      body.offer_id || body.offerId
    );
  }

  if (!offerId) {
    return sendJson(res, 400, {
      ok: false,
      error: "offer_id is required."
    });
  }

  if (!isValidOfferId(offerId)) {
    return sendJson(res, 400, {
      ok: false,
      error: "Invalid Duffel offer_id."
    });
  }

  try {
    const {
      response,
      payload
    } = await fetchDuffelOffer(
      accessToken,
      offerId
    );

    if (!response.ok) {
      const message =
        getDuffelErrorMessage(payload);

      let status = response.status;

      if (
        status < 400 ||
        status > 599
      ) {
        status = 502;
      }

      return sendJson(res, status, {
        ok: false,
        error: message,
        duffel_status: response.status,
        duffel_errors:
          Array.isArray(payload?.errors)
            ? payload.errors
            : []
      });
    }

    const rawOffer = payload?.data;

    if (!rawOffer || !rawOffer.id) {
      return sendJson(res, 502, {
        ok: false,
        error:
          "Duffel returned an invalid offer response."
      });
    }

    const offer = mapOffer(rawOffer);

    if (!offer) {
      return sendJson(res, 502, {
        ok: false,
        error:
          "Unable to process Duffel offer."
      });
    }

    const now = Date.now();

    const expiresAt = offer.expires_at
      ? Date.parse(offer.expires_at)
      : NaN;

    const expired =
      Number.isFinite(expiresAt) &&
      expiresAt <= now;

    return sendJson(res, 200, {
      ok: true,

      offer_id: offer.id,

      expired,

      booking_ready: !expired,

      retrieved_at:
        new Date().toISOString(),

      data: offer
    });
  } catch (error) {
    console.error(
      "HAVKAR flight-offer error:",
      error
    );

    return sendJson(res, 500, {
      ok: false,
      error:
        "Unable to retrieve the selected flight offer."
    });
  }
    }
